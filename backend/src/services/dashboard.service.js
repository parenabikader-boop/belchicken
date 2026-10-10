import { prisma } from '../lib/prisma.js';
import { buildDashboard, periodRange } from './dashboard.js';

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
