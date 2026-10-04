// Tableau de bord du Patron : calculs sans base de données (testés dans test/dashboard.test.js).
// Burkina Faso = heure UTC toute l'année (pas d'heure d'été) : les jours se coupent à minuit UTC.
import { z } from 'zod';

const DAY = 24 * 3600 * 1000;
export const PERIODS = ['day', 'week', 'month'];
// Seules les commandes payées (et au-delà) comptent dans le chiffre d'affaires
export const PAID = ['PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE'];
const isPaid = (o) => PAID.includes(o.status);
// Frais de livraison : comptés une fois reçus, sauf si la commande a été annulée ensuite
const feeCounted = (o) => o.deliveryFee != null && o.deliveryFeeReceivedAt != null && o.status !== 'ANNULEE';

export const dashboardQuerySchema = z.object({
  period: z.enum(PERIODS).default('day'),
  offset: z.coerce.number().int().min(-60).max(0).default(0),
});

const startOfDay = (t) => Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());

function bounds(period, offset, now) {
  if (period === 'day') {
    const start = startOfDay(now) + offset * DAY;
    return { start, end: start + DAY, prevStart: start - DAY };
  }
  if (period === 'week') {
    const monday = startOfDay(now) - ((now.getUTCDay() + 6) % 7) * DAY; // semaine du lundi au dimanche
    const start = monday + offset * 7 * DAY;
    return { start, end: start + 7 * DAY, prevStart: start - 7 * DAY };
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + offset;
  return { start: Date.UTC(y, m, 1), end: Date.UTC(y, m + 1, 1), prevStart: Date.UTC(y, m - 1, 1) };
}

// Période affichée et période de comparaison. Pour la période en cours, on compare au même moment
// de la précédente (aujourd'hui jusqu'à 14 h contre hier jusqu'à 14 h) ; sinon aux périodes entières.
export function periodRange(period, offset = 0, now = new Date()) {
  const { start, end, prevStart } = bounds(period, offset, now);
  const isCurrent = offset === 0;
  const cutoff = isCurrent ? Math.min(now.getTime(), end) : end;
  const compareEnd = isCurrent ? Math.min(prevStart + (cutoff - start), start) : start;
  const d = (t) => new Date(t);
  return { period, offset, isCurrent, start: d(start), end: d(end), cutoff: d(cutoff), prevStart: d(prevStart), compareEnd: d(compareEnd) };
}

const inRange = (o, from, to) => o.createdAt >= from && o.createdAt < to;

export function summarize(orders) {
  const paid = orders.filter(isPaid);
  const revenue = paid.reduce((s, o) => s + o.itemsTotal, 0); // plats seulement
  const fees = orders.filter(feeCounted);
  return {
    received: orders.length,
    paid: paid.length,
    revenue,
    deliveryRevenue: fees.reduce((s, o) => s + o.deliveryFee, 0),
    deliveryPaid: fees.length,
    avgBasket: paid.length ? Math.round(revenue / paid.length) : 0,
    cancelled: orders.filter((o) => o.status === 'ANNULEE').length,
    toVerify: orders.filter((o) => o.status === 'PAIEMENT_A_VERIFIER').length,
  };
}

// Chiffre d'affaires dans le temps : par heure (jour), par jour (semaine, mois)
function timeline(range, paid) {
  const size = range.period === 'day' ? 3600 * 1000 : DAY;
  const n = Math.round((range.end - range.start) / size);
  const buckets = Array.from({ length: n }, (_, i) => ({ at: new Date(range.start.getTime() + i * size), revenue: 0, paid: 0 }));
  for (const o of paid) {
    const b = buckets[Math.floor((o.createdAt - range.start) / size)];
    if (b) {
      b.revenue += o.itemsTotal;
      b.paid += 1;
    }
  }
  return buckets;
}

function top(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = key(r);
    const cur = map.get(k.id) || { name: k.name, quantity: 0, revenue: 0 };
    cur.quantity += r.quantity;
    cur.revenue += r.lineTotal;
    map.set(k.id, cur);
  }
  return [...map.values()];
}

export function buildDashboard(orders, range) {
  const current = orders.filter((o) => inRange(o, range.start, range.cutoff));
  const previous = orders.filter((o) => inRange(o, range.prevStart, range.compareEnd));
  const paid = current.filter(isPaid);
  const items = paid.flatMap((o) => o.items);

  // Heures et jours de pointe : toutes les commandes reçues (la demande), annulées comprises
  const hours = Array(24).fill(0);
  const weekdays = Array(7).fill(0); // lundi = 0
  for (const o of current) {
    hours[o.createdAt.getUTCHours()] += 1;
    weekdays[(o.createdAt.getUTCDay() + 6) % 7] += 1;
  }

  const payments = ['ORANGE_MONEY', 'MOOV_MONEY'].map((method) => {
    const list = paid.filter((o) => o.paymentMethod === method);
    return { method, paid: list.length, revenue: list.reduce((s, o) => s + o.itemsTotal, 0) };
  });

  const cancelled = current.filter((o) => o.status === 'ANNULEE');
  const reasons = new Map();
  for (const o of cancelled) {
    const reason = o.cancelReason?.trim() || 'Sans motif';
    const k = reason.toLocaleLowerCase('fr');
    reasons.set(k, { reason: reasons.get(k)?.reason || reason, count: (reasons.get(k)?.count || 0) + 1 });
  }
  const cancelledAt = (o) => o.cancelledAt || o.createdAt;

  return {
    range,
    summary: summarize(current),
    previous: summarize(previous),
    timeline: timeline(range, paid),
    // Plats : par quantité vendue ; catégories : par chiffre d'affaires
    topProducts: top(items, (i) => ({ id: i.productId || `nom:${i.productName}`, name: i.productName }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 8),
    topCategories: top(items, (i) => ({ id: i.categoryName || '-', name: i.categoryName || 'Plats retirés du menu' }))
      .sort((a, b) => b.revenue - a.revenue),
    hours,
    weekdays,
    payments,
    cancellations: {
      count: cancelled.length,
      reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
      latest: cancelled
        .sort((a, b) => cancelledAt(b) - cancelledAt(a))
        .slice(0, 10)
        .map((o) => ({
          reference: o.reference,
          customerName: o.customerName,
          amount: o.itemsTotal,
          reason: o.cancelReason || null,
          by: o.cancelledBy || null,
          at: cancelledAt(o),
        })),
    },
  };
}
