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
import { accountsRange, buildAccounts, pct, topDishes } from './patron-accounts.js';
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

export async function getAccounts(query, now = new Date()) {
  const range = accountsRange(query, now);
  if (range.error) throw new AppError(400, range.error, 'PERIODE_INVALIDE');
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: range.prevStart, lt: range.cutoff } },
    select: orderSelect,
    orderBy: { createdAt: 'asc' },
  });
  return buildAccounts(orders, range, { since: accountsSince(), now });
}

// ─── Réglage des résumés (table PatronAccount) ───

const missingTable = (e) => e?.code === 'P2021' || e?.code === 'P2022';
const MIGRATION_NEEDED = () => new AppError(503, 'Réglage pas encore disponible : la base doit d’abord être mise à jour par votre prestataire.', 'MIGRATION_EN_ATTENTE');
const publicSettings = (row) => ({
  eveningOn: row.eveningOn, eveningHour: row.eveningHour, weeklyOn: row.weeklyOn, weeklyHour: row.weeklyHour,
});

export async function getDigestSettings() {
  try {
    const row = await prisma.patronAccount.findUnique({ where: { id: 1 } });
    return { ...publicSettings(row || DEFAULT_SETTINGS), missing: false };
  } catch (e) {
    if (missingTable(e)) return { ...DEFAULT_SETTINGS, missing: true };
    throw e;
  }
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
    const field = due.kind === 'soir' ? 'lastEveningFor' : 'lastWeeklyFor';
    const claimed = await prisma.patronAccount.updateMany({
      where: { id: 1, OR: [{ [field]: null }, { [field]: { not: due.key } }] },
      data: { [field]: due.key },
    });
    if (claimed.count !== 1) continue;
    const stats = await digestStats(due.from, due.to);
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
