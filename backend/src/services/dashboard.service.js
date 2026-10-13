import { prisma } from '../lib/prisma.js';
import { buildDashboard, PAID, periodRange } from './dashboard.js';
import { buildToday, todayRanges } from './today.js';
import { getFeatures } from './features.service.js';

// Charge les commandes de la période et de la période de comparaison, puis calcule (voir dashboard.js)
export async function getDashboard({ period, offset }) {
  const range = periodRange(period, offset);
  const rows = await prisma.order.findMany({
    where: { createdAt: { gte: range.prevStart, lt: range.cutoff } },
    select: {
      reference: true,
      status: true,
      paymentMethod: true,
      itemsTotal: true,
      deliveryFee: true,
      deliveryFeeMethod: true,
      deliveryOperator: true,
      courierId: true,
      courierName: true,
      customerName: true,
      createdAt: true,
      items: {
        select: {
          productId: true, productName: true, quantity: true, lineTotal: true,
          product: { select: { category: { select: { name: true } } } },
        },
      },
      // Annulation (motif), départ du livreur et remise : pour les annulations et le temps de livraison
      statusChanges: {
        where: { toStatus: { in: ['ANNULEE', 'EN_LIVRAISON', 'LIVREE'] } },
        select: { toStatus: true, reason: true, staffName: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const orders = rows.map(({ items, statusChanges, ...o }) => {
    const last = (status) => statusChanges.findLast((h) => h.toStatus === status);
    const cancel = last('ANNULEE');
    const delivered = last('LIVREE');
    return {
      ...o,
      items: items.map(({ product, ...i }) => ({ ...i, categoryName: product?.category?.name || null })),
      cancelReason: cancel?.reason || null,
      cancelledBy: cancel?.staffName || null,
      cancelledAt: cancel?.createdAt || null,
      startedAt: last('EN_LIVRAISON')?.createdAt || null,
      deliveredAt: delivered?.createdAt || null,
      withoutCode: Boolean(delivered?.reason), // validée par l'agent, avec un motif
    };
  });
  // Espèces encore chez les livreurs du restaurant, aujourd'hui (quelle que soit la période affichée).
  // Lot 5b : jamais celles de notre équipe (caisse séparée).
  const cash = await prisma.order.aggregate({
    where: { status: 'LIVREE', deliveryOperator: 'RESTAURANT', deliveryFeeMethod: 'ESPECES', cashRemittanceId: null },
    _sum: { deliveryFee: true },
    _count: { _all: true },
  });
  return {
    ...buildDashboard(orders, range),
    cashWithCouriers: { amount: cash._sum.deliveryFee || 0, count: cash._count._all },
  };
}

// Lot « tableau de bord d'un coup d'œil » : bloc « Aujourd'hui » (voir today.js). Toutes les lectures partent en même
// temps (un seul aller-retour vers la base), sans les plats ni l'historique de chaque commande : les plats les plus
// vendus sont additionnés par la base elle-même.
const CASH_WITH_COURIERS = {
  where: { status: 'LIVREE', deliveryOperator: 'RESTAURANT', deliveryFeeMethod: 'ESPECES', cashRemittanceId: null },
  _sum: { deliveryFee: true },
  _count: { _all: true },
};
const topSince = (start, end) => prisma.orderItem.groupBy({
  by: ['productId', 'productName'],
  where: { order: { createdAt: { gte: start, lt: end }, status: { in: PAID } } },
  _sum: { quantity: true, lineTotal: true },
});

export async function getToday(now = new Date()) {
  const ranges = todayRanges(now);
  const slices = [ranges.today, ranges.yesterday, ranges.lastWeek].map((r) => ({ createdAt: { gte: r.start, lt: r.end } }));
  const [orders, sources, topToday, topWeek, cash, features, toCall] = await Promise.all([
    prisma.order.findMany({
      where: { OR: slices },
      select: {
        status: true, paymentMethod: true, itemsTotal: true, deliveryFee: true, deliveryFeeMethod: true,
        deliveryOperator: true, sourceId: true, sourceName: true, createdAt: true,
      },
    }),
    prisma.orderSource.findMany({ select: { id: true, name: true, kind: true, position: true, isActive: true } }),
    topSince(ranges.today.start, now),
    topSince(ranges.weekStart, now),
    prisma.order.aggregate(CASH_WITH_COURIERS),
    getFeatures(),
    // Mauvais avis pas encore rappelés (même règle que la page Avis), toutes dates confondues
    prisma.orderReview.count({ where: { lowRating: true, calledBackAt: null } }),
  ]);
  return {
    ...buildToday({ orders, sources, topToday, topWeek, ranges }),
    cashWithCouriers: { amount: cash._sum.deliveryFee || 0, count: cash._count._all },
    reviewsToCall: features.AVIS ? toCall : null, // null = avis fermés par le Prestataire : ligne cachée
    salesOpen: features.VENTES, // lien « Ventes » seulement si la page est ouverte
  };
}
