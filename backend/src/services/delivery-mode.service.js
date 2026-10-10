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

const FIELDS = Object.keys(DEFAULT_COMPANY);
const pick = (row) => Object.fromEntries(FIELDS.map((f) => [f, row?.[f] ?? DEFAULT_COMPANY[f]]));

// Notre société (pas de ligne = mode Restaurant, rien de rempli)
export const getCompany = async (db = prisma) => pick(await db.deliveryCompany.findUnique({ where: { id: 1 } }));

// Mode des nouvelles commandes (noté sur la commande à sa création)
export const getDeliveryMode = async (db = prisma) => effectiveMode(await getCompany(db));

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
  return ctx;
}

// Page Prestataire : réglages, ce qui manque pour le mode Prestataire, commandes qui attendent nos codes
export async function getCompanyPage() {
  const [company, awaitingFees, row] = await Promise.all([
    getCompany(),
    prisma.order.count({ where: awaitingFeesWhere }),
    prisma.deliveryCompany.findUnique({ where: { id: 1 }, select: { updatedAt: true, updatedByName: true } }),
  ]);
  return {
    company,
    effectiveMode: effectiveMode(company),
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
    const error = companyUpdateError(after, { awaitingFees: await tx.order.count({ where: awaitingFeesWhere }) });
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
