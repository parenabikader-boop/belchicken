// Lot 5d : relevé de notre équipe de livraison et conditions du contrat (accès à la base).
// Règles dans statement.js. Rien ici ne lit les ventes de Belchicken (plats, totaux, paiement des plats).
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { logSecurity } from './security-log.service.js';
import { isFeatureOpen } from './features.service.js';
import { CALL_CENTER_LIGHT } from './features.js';
import {
  buildStatement, canDeleteTerms, checkTerms, parsePeriod, seesContract, termsPage, termsText,
} from './statement.js';

const stepsSelect = {
  statusChanges: { select: { toStatus: true, fromStatus: true, createdAt: true, reason: true, staffName: true }, orderBy: { createdAt: 'asc' } },
};

// Seulement ce dont le relevé a besoin : jamais itemsTotal, items, paymentMethod ni paymentPayerPhone
const orderSelect = {
  reference: true,
  status: true,
  deliveryFee: true,
  deliveryNightFee: true,
  deliveryFeeMethod: true,
  deliveryFeeVerifiedAt: true,
  cashRemittanceId: true,
  courierId: true,
  courierName: true,
  deliveryRunId: true,
  deliveryZoneName: true,
  latitude: true, // seulement pour écrire « Position GPS » quand il n'y a pas de quartier
  ...stepsSelect,
  events: { where: { type: 'RECUPEREE_SANS_LIVREUR' }, select: { type: true, createdAt: true } },
};

export function periodOrError(du, au, now = new Date()) {
  const period = parsePeriod(du, au, now);
  if (period.error) throw new AppError(400, period.error, 'PERIODE_INVALIDE');
  return period;
}

const listVersions = () => prisma.deliveryContractTerms.findMany({ orderBy: { validFrom: 'asc' } });

// Relevé pour un membre de l'équipe : le Responsable livraison le reçoit sans conditions ni montant dû
// (les conditions ne sont même pas lues pour lui)
export async function getStatement(staff, { du, au }, now = new Date()) {
  const period = periodOrError(du, au, now);
  const withContract = seesContract(staff.role);
  const range = { gte: period.from, lt: period.end };
  const [orders, runs, versions, company, light] = await Promise.all([
    prisma.order.findMany({
      where: {
        deliveryOperator: 'PRESTATAIRE',
        mode: 'LIVRAISON',
        status: { in: ['LIVREE', 'ANNULEE'] },
        statusChanges: { some: { toStatus: { in: ['LIVREE', 'ANNULEE'] }, createdAt: range } },
      },
      select: orderSelect,
    }),
    prisma.deliveryRun.findMany({
      where: { operator: 'PRESTATAIRE', createdAt: range },
      select: { id: true, createdAt: true, courierName: true, createdByName: true, orders: { select: { status: true, ...stepsSelect } } },
    }),
    withContract ? listVersions() : Promise.resolve([]),
    prisma.deliveryCompany.findUnique({ where: { id: 1 }, select: { companyName: true } }),
    isFeatureOpen(CALL_CENTER_LIGHT), // plan 1 : livraisons sans code comptées à part
  ]);
  return buildStatement({ period, orders, runs, versions, company, withContract, light, now });
}

// ─── Conditions du contrat (Prestataire ; Patron en lecture si RELEVE est ouvert) ───

export async function getTerms(now = new Date()) {
  return termsPage(await listVersions(), now);
}

export async function createTerms(staff, input, meta, now = new Date()) {
  const { data, error } = checkTerms(input, now);
  if (error) throw new AppError(400, error, 'CONDITIONS_INVALIDES');
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryContractTerms.create({ data: { ...data, createdByName: staff.name } });
      await logSecurity({ type: 'CONTRAT', actor: staff, detail: `Version ajoutée, à partir du ${input.validFrom} : ${termsText(created)}`, meta }, tx);
    });
  } catch (e) {
    if (e.code === 'P2002') throw new AppError(409, 'Une version commence déjà ce jour-là. Choisissez une autre date d’effet.', 'VERSION_EXISTE');
    throw e;
  }
  return getTerms(now);
}

export async function deleteTerms(staff, id, meta, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const v = await tx.deliveryContractTerms.findUnique({ where: { id } });
    if (!v) throw new AppError(404, 'Cette version n’existe plus. La page est mise à jour.', 'VERSION_INTROUVABLE');
    if (!canDeleteTerms(v, now)) throw new AppError(409, 'Cette version a déjà commencé : elle ne peut plus être supprimée. Ajoutez une nouvelle version.', 'VERSION_COMMENCEE');
    await tx.deliveryContractTerms.delete({ where: { id } });
    await logSecurity({ type: 'CONTRAT', actor: staff, detail: `Version supprimée (pas encore commencée), à partir du ${v.validFrom.toISOString().slice(0, 10)} : ${termsText(v)}`, meta }, tx);
  });
  return getTerms(now);
}
