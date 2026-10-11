// Lot 6 : ventes par période (accès à la base, lecture seule). Règles dans sales.js.
// Jamais le nom, le téléphone ni la position du client.
import { prisma } from '../lib/prisma.js';
import { buildSales } from './sales.js';
import { periodOrError } from './statement.service.js';

const orderSelect = {
  reference: true,
  status: true,
  mode: true,
  paymentMethod: true,
  itemsTotal: true,
  deliveryFee: true,
  deliveryFeeMethod: true,
  deliveryOperator: true,
  sourceId: true,
  sourceName: true,
  source: { select: { kind: true } },
  createdById: true,
  createdByName: true,
  createdBy: { select: { role: true } },
  createdAt: true,
  // Paiement vérifié (premier « Payée ») et annulation (étape, motif, qui)
  statusChanges: {
    where: { toStatus: { in: ['PAYEE', 'ANNULEE'] } },
    select: { toStatus: true, fromStatus: true, reason: true, staffUserId: true, staffName: true, createdAt: true, staffUser: { select: { role: true } } },
    orderBy: { createdAt: 'asc' },
  },
};

export async function getSales({ du, au }, { withOrders = false, now = new Date() } = {}) {
  const period = periodOrError(du, au, now);
  const [orders, sources] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: period.from, lt: period.end } }, select: orderSelect, orderBy: { createdAt: 'asc' } }),
    prisma.orderSource.findMany({ select: { id: true, name: true, kind: true, position: true, isActive: true } }),
  ]);
  return buildSales(orders, sources, period, { now, withOrders });
}
