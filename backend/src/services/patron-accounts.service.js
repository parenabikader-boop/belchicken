// Compte Patron simplifié (interrupteur COMPTE_PATRON_SIMPLE) : lectures de la page Comptes, réglage des résumés,
// et réveil (/api/reveil) qui envoie les résumés et les alertes de rupture. Règles dans patron-accounts.js et
// patron-digest.js. Jamais le nom du client ; son numéro masqué.
//
// Table PatronAccount (migration en attente) : sans elle, la page Comptes marche ; lire le réglage renvoie les heures
// par défaut (missing: true), l'enregistrer est refusé avec un message clair, et le réveil n'envoie rien.
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { PAID } from './dashboard.js';
import { getFeatures } from './features.service.js';
import { PATRON_SIMPLE } from './features.js';
import { accountsRange, buildAccounts, goalProgress, monthKey, pct, topDishes } from './patron-accounts.js';
import { DEFAULT_SETTINGS, digestNotification, dueDigests, outageNotification, outageUpdate } from './patron-digest.js';
import { pushStaffRoles } from './push.service.js';
import { average } from './review.js';
import { parseDay } from './statement.js';

// Les résumés et les alertes vont au Patron (le Prestataire voit la page Comptes, sans recevoir les résumés)
const TO = ['PATRON'];

const orderSelect = {
  reference: true,
  status: true,
  mode: true,
  paymentMethod: true,
  paymentPayerPhone: true,
  customerPhone: true, // lot B : clients fidèles, regroupés par numéro ; jamais renvoyé au site (patron-accounts.js)
  itemsTotal: true,
  deliveryFee: true,
  deliveryFeeMethod: true,
  deliveryOperator: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  items: { select: { productId: true, productName: true, quantity: true, lineTotal: true } },
  // Paiement vérifié (premier « Payée » : qui, automatique ou non) et annulation
  statusChanges: {
    where: { toStatus: { in: ['PAYEE', 'ANNULEE'] } },
    select: { toStatus: true, fromStatus: true, staffUserId: true, staffName: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
};

export const accountsSince = () => parseDay(env.patron.accountsSince) || null;

// Ventes des repas depuis `from` (commandes payées, sans les commandes d'essai)
async function revenueSince(from, to) {
  const since = accountsSince();
  const start = since && since > from ? since : from;
  const agg = await prisma.order.aggregate({ where: { createdAt: { gte: start, lt: to }, status: { in: PAID } }, _sum: { itemsTotal: true } });
  return agg._sum.itemsTotal || 0;
}

// Lot B : objectif du mois en cours et sa progression (null sans objectif, ou sans la table PatronAccount)
export async function currentGoal(now = new Date()) {
  const row = await readAccount();
  const amount = Number(row?.goals?.[monthKey(now)]) || 0;
  if (!amount) return null;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return goalProgress(amount, await revenueSince(monthStart, now), now);
}

export async function getAccounts(query, now = new Date()) {
  const range = accountsRange(query, now);
  if (range.error) throw new AppError(400, range.error, 'PERIODE_INVALIDE');
  const since = accountsSince();
  const [orders, reviews, goal] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: range.prevStart, lt: range.cutoff } },
      select: orderSelect,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orderReview.findMany({
      where: { createdAt: { gte: range.start, lt: range.cutoff } },
      select: { callCenterRating: true, foodRating: true, deliveryRating: true, lowRating: true },
    }),
    currentGoal(now),
  ]);
  // Clients fidèles : numéros des ventes de la période déjà venus avant (commandes payées, après les essais)
  const phones = [...new Set(orders
    .filter((o) => PAID.includes(o.status) && o.createdAt >= range.start && (!since || o.createdAt >= since))
    .map((o) => o.customerPhone).filter(Boolean))];
  const before = phones.length ? await prisma.order.findMany({
    where: { customerPhone: { in: phones }, status: { in: PAID }, createdAt: { lt: range.start, ...(since && { gte: since }) } },
    select: { customerPhone: true },
    distinct: ['customerPhone'],
  }) : [];
  return buildAccounts(orders, range, { since, now, earlier: new Set(before.map((o) => o.customerPhone)), reviews, goal });
}

// ─── Réglage des résumés (table PatronAccount) ───

const missingTable = (e) => e?.code === 'P2021' || e?.code === 'P2022';
const MIGRATION_NEEDED = () => new AppError(503, 'Réglage pas encore disponible : la base doit d’abord être mise à jour par votre prestataire.', 'MIGRATION_EN_ATTENTE');
const publicSettings = (row) => ({
  eveningOn: row.eveningOn, eveningHour: row.eveningHour, weeklyOn: row.weeklyOn, weeklyHour: row.weeklyHour,
  monthlyOn: row.monthlyOn ?? true,
});

// Ligne PatronAccount, ou null (pas encore créée, ou table absente : migration en attente)
async function readAccount() {
  try {
    return await prisma.patronAccount.findUnique({ where: { id: 1 } });
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
}

export async function getDigestSettings() {
  try {
    const row = await prisma.patronAccount.findUnique({ where: { id: 1 } });
    return { ...publicSettings(row || DEFAULT_SETTINGS), missing: false };
  } catch (e) {
    if (missingTable(e)) return { ...DEFAULT_SETTINGS, missing: true };
    throw e;
  }
}

// Lot B : objectif de ventes du mois en cours (0 = retiré). Les objectifs des mois passés sont gardés.
export async function saveGoal(montant, staff, now = new Date()) {
  try {
    const row = await prisma.patronAccount.findUnique({ where: { id: 1 } });
    const goals = { ...(row?.goals || {}) };
    if (montant > 0) goals[monthKey(now)] = montant;
    else delete goals[monthKey(now)];
    await prisma.patronAccount.upsert({
      where: { id: 1 },
      create: { id: 1, goals, updatedByName: staff.name },
      update: { goals, updatedByName: staff.name },
    });
  } catch (e) {
    if (missingTable(e)) throw MIGRATION_NEEDED();
    throw e;
  }
  return currentGoal(now);
}

export async function saveDigestSettings(data, staff) {
  try {
    const row = await prisma.patronAccount.upsert({
      where: { id: 1 },
      create: { id: 1, ...data, updatedByName: staff.name },
      update: { ...data, updatedByName: staff.name },
    });
    return { ...publicSettings(row), missing: false };
  } catch (e) {
    if (missingTable(e)) throw MIGRATION_NEEDED();
    throw e;
  }
}

// ─── Réveil : résumés dus et ruptures de stock ───

// Chiffres d'un résumé : ventes des plats, commandes payées, meilleur plat, note moyenne des avis reçus sur la période
async function digestStats(from, to) {
  const since = accountsSince();
  const start = since && since > from ? since : from;
  const where = { createdAt: { gte: start, lt: to }, status: { in: PAID } };
  const [orders, reviews] = await Promise.all([
    prisma.order.findMany({ where, select: { itemsTotal: true, items: { select: { productId: true, productName: true, quantity: true, lineTotal: true } } } }),
    prisma.orderReview.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { callCenterRating: true, foodRating: true, deliveryRating: true } }),
  ]);
  const [best] = topDishes(orders, 1);
  return {
    revenue: orders.reduce((s, o) => s + o.itemsTotal, 0),
    paid: orders.length,
    topDish: best || null,
    reviews: { count: reviews.length, average: average(reviews.flatMap((r) => [r.callCenterRating, r.foodRating, r.deliveryRating])) },
  };
}

// Un appel du service de réveil. Interrupteur fermé : rien. Chaque résumé est d'abord réservé en base (jamais deux
// envois, même si deux réveils arrivent en même temps), puis envoyé. Renvoie ce qui a été fait (sans chiffre).
export async function runPatronTick(now = new Date()) {
  if (!(await getFeatures())[PATRON_SIMPLE]) return { open: false };
  let row;
  try {
    row = await prisma.patronAccount.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  } catch (e) {
    if (missingTable(e)) return { open: true, migration: false };
    throw e;
  }
  const done = [];
  for (const due of dueDigests(now, row, row)) {
    const field = { soir: 'lastEveningFor', semaine: 'lastWeeklyFor', mois: 'lastMonthlyFor' }[due.kind];
    const claimed = await prisma.patronAccount.updateMany({
      where: { id: 1, OR: [{ [field]: null }, { [field]: { not: due.key } }] },
      data: { [field]: due.key },
    });
    if (claimed.count !== 1) continue;
    const stats = await digestStats(due.from, due.to);
    if (due.kind === 'soir') stats.goalPct = (await currentGoal(now))?.pct ?? null;
    if (due.kind === 'semaine') {
      const before = await digestStats(new Date(due.from.getTime() - (due.to - due.from)), due.from);
      stats.change = before.paid >= 5 ? pct(stats.revenue, before.revenue) : null;
    }
    const phones = await pushStaffRoles(TO, digestNotification(due.kind, stats, due.from));
    done.push({ kind: due.kind, key: due.key, phones });
  }
  // Ruptures : plats du menu indisponibles, vus à chaque réveil
  const products = await prisma.product.findMany({ where: { archivedAt: null }, select: { id: true, name: true, isAvailable: true, archivedAt: true } });
  const { outages, alerts } = outageUpdate(products, row.outages || {}, now);
  await prisma.patronAccount.update({ where: { id: 1 }, data: { outages } });
  for (const a of alerts) {
    await pushStaffRoles(TO, outageNotification(a, now));
    done.push({ kind: 'rupture', key: a.id });
  }
  return { open: true, migration: true, done };
}
