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
      deliveryFeeReceivedAt: true,
      customerName: true,
      createdAt: true,
      items: {
        select: {
          productId: true, productName: true, quantity: true, lineTotal: true,
          product: { select: { category: { select: { name: true } } } },
        },
      },
      statusChanges: {
        where: { toStatus: 'ANNULEE' },
        select: { reason: true, staffName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  const orders = rows.map(({ items, statusChanges, ...o }) => ({
    ...o,
    items: items.map(({ product, ...i }) => ({ ...i, categoryName: product?.category?.name || null })),
    cancelReason: statusChanges[0]?.reason || null,
    cancelledBy: statusChanges[0]?.staffName || null,
    cancelledAt: statusChanges[0]?.createdAt || null,
  }));
  return buildDashboard(orders, range);
}
