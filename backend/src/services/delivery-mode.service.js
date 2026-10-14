// Lot 5 : mode de livraison et notre société en base (règles dans delivery-mode.js)
import { prisma } from '../lib/prisma.js';
import { messageContext } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import {
  cleanCompanyInput, companyChanges, companyPayment, companyReady, companyUpdateError, DEFAULT_COMPANY, effectiveMode,
  missingForPrestataire,
} from './delivery-mode.js';
import { ACTIVE } from './order-status.js';
import { logSecurity } from './security-log.service.js';
import { isFeatureOpen } from './features.service.js';
import { reviewLinkActive } from './review.js';

const FIELDS = Object.keys(DEFAULT_COMPANY);
const pick = (row) => Object.fromEntries(FIELDS.map((f) => [f, row?.[f] ?? DEFAULT_COMPANY[f]]));

// Notre société (pas de ligne = mode Restaurant, rien de rempli)
export const getCompany = async (db = prisma) => pick(await db.deliveryCompany.findUnique({ where: { id: 1 } }));

// Interrupteur LIVREURS_INDEPENDANTS (fermé sans ligne)
const independentOpen = (db = prisma) => isFeatureOpen('LIVREURS_INDEPENDANTS', db);

// Mode des nouvelles commandes (noté sur la commande à sa création). L'interrupteur n'est lu que pour le
// mode Indépendants : en mode Restaurant ou Prestataire, rien de plus n'est demandé à la base.
export async function getDeliveryMode(db = prisma) {
  const company = await getCompany(db);
  return effectiveMode(company, { independentOpen: company.mode === 'INDEPENDANT' && (await independentOpen(db)) });
}

// Commandes en mode Prestataire dont le client va encore payer les frais sur nos codes
const awaitingFeesWhere = {
  deliveryOperator: 'PRESTATAIRE', mode: 'LIVRAISON', status: { in: ACTIVE }, deliveryFeeMethod: null,
  OR: [{ deliveryFee: null }, { deliveryFee: { gt: 0 } }], // pas encore saisis, ou à payer (0 F = livraison offerte)
};

// Contexte des messages au client pour cette commande : nos codes pour les frais d'une commande en mode
// Prestataire (lus en base seulement dans ce cas), sinon exactement comme avant
export async function messageContextFor(order) {
  const ctx = messageContext();
  if (order?.deliveryOperator === 'PRESTATAIRE') ctx.prestatairePayment = companyPayment(await getCompany());
  // Lot 7 : lien de l'avis dans le remerciement (lu en base seulement pour une commande livrée qui a sa clé)
  if (order?.reviewToken && order.status === 'LIVREE') ctx.reviewLink = await reviewLinkFor(order);
  return ctx;
}

// Lot 7 : le lien de l'avis va-t-il dans le message ? Interrupteur AVIS ouvert et 7 jours au plus
async function reviewLinkFor(order) {
  const statusChanges = order.statusChanges?.some((h) => h.toStatus === 'LIVREE')
    ? order.statusChanges
    : await prisma.orderStatusChange.findMany({ where: { orderId: order.id, toStatus: 'LIVREE' }, select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  return reviewLinkActive({ ...order, statusChanges }, { avisOpen: await isFeatureOpen('AVIS') });
}

// Page Prestataire : réglages, ce qui manque pour le mode Prestataire, commandes qui attendent nos codes
export async function getCompanyPage() {
  const [company, awaitingFees, row, indep] = await Promise.all([
    getCompany(),
    prisma.order.count({ where: awaitingFeesWhere }),
    prisma.deliveryCompany.findUnique({ where: { id: 1 }, select: { updatedAt: true, updatedByName: true } }),
    independentOpen(),
  ]);
  return {
    company,
    effectiveMode: effectiveMode(company, { independentOpen: indep }),
    independentOpen: indep, // troisième choix « Livreurs indépendants » proposé
    ready: companyReady(company),
    missing: missingForPrestataire(company),
    awaitingFees,
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

// Enregistrement par le Prestataire. Chaque changement est noté au journal de sécurité (type LIVRAISON).
export async function updateCompany(input, staff, meta) {
  await prisma.$transaction(async (tx) => {
    const before = await getCompany(tx);
    const after = { ...before, ...cleanCompanyInput(input) };
    const error = companyUpdateError(after, {
      awaitingFees: await tx.order.count({ where: awaitingFeesWhere }),
      independentOpen: await independentOpen(tx),
      previousMode: before.mode,
    });
    if (error) throw new AppError(400, error, 'LIVRAISON_REFUSEE');
    const changes = companyChanges(before, after);
    if (!changes.length) return;
    await tx.deliveryCompany.upsert({
      where: { id: 1 },
      create: { id: 1, ...after, updatedByName: staff.name },
      update: { ...after, updatedByName: staff.name },
    });
    // Une ligne par changement : rien n'est coupé (300 caractères au plus par ligne du journal)
    for (const detail of changes) await logSecurity({ type: 'LIVRAISON', actor: staff, detail, meta }, tx);
  });
  return getCompanyPage();
}
