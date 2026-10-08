// Caisse : frais de livraison à vérifier (mobile money) et espèces chez les livreurs (règles dans cash.js)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { cashByCourier, remitError, remitTotal } from './cash.js';

const REMITTANCES_SHOWN = 30;

const deliveredAt = (o) => o.statusChanges.findLast((h) => h.toStatus === 'LIVREE')?.createdAt || null;
const DELIVERED = { statusChanges: { where: { toStatus: 'LIVREE' }, select: { toStatus: true, createdAt: true } } };

export async function getCash(now = new Date()) {
  const [toVerify, verified, cash, couriers, remittances] = await Promise.all([
    // Mobile money pas encore vérifié, le plus ancien en premier
    prisma.order.findMany({
      where: { status: 'LIVREE', deliveryFeeMethod: 'MOBILE_MONEY', deliveryFeeVerifiedAt: null },
      include: DELIVERED,
      orderBy: { updatedAt: 'asc' },
    }),
    // Vérifiés ces dernières 24 h : pour corriger une erreur de manipulation
    prisma.order.findMany({
      where: { status: 'LIVREE', deliveryFeeMethod: 'MOBILE_MONEY', deliveryFeeVerifiedAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
      include: DELIVERED,
      orderBy: { deliveryFeeVerifiedAt: 'desc' },
    }),
    // Espèces encore chez les livreurs
    prisma.order.findMany({
      where: { status: 'LIVREE', deliveryFeeMethod: 'ESPECES', cashRemittanceId: null },
      include: DELIVERED,
    }),
    prisma.staffUser.findMany({ where: { role: 'LIVREUR', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.cashRemittance.findMany({ orderBy: { createdAt: 'desc' }, take: REMITTANCES_SHOWN }),
  ]);
  const feeRow = (o) => ({
    reference: o.reference,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryFee: o.deliveryFee,
    deliveryZoneName: o.deliveryZoneName,
    courierName: o.courierName,
    deliveredAt: deliveredAt(o),
    verifiedAt: o.deliveryFeeVerifiedAt,
  });
  return {
    toVerify: toVerify.map(feeRow),
    verified: verified.map(feeRow),
    couriers: cashByCourier(cash.map((o) => ({ ...o, deliveredAt: deliveredAt(o) })), couriers, now),
    remittances: remittances.map((r) => ({
      id: r.id, courierName: r.courierName, amount: r.amount, orderCount: r.orderCount, receivedBy: r.receivedByName, at: r.createdAt,
    })),
  };
}

// « Espèces remises » : le livreur a remis l'argent de ces courses (celles affichées à l'écran de l'agent)
export async function remitCash({ courierId, references }, staff) {
  const remittance = await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { reference: { in: references } },
      select: { id: true, reference: true, status: true, courierId: true, courierName: true, deliveryFee: true, deliveryFeeMethod: true, cashRemittanceId: true },
    });
    const error = remitError(orders, courierId, references);
    if (error) throw new AppError(409, error, 'REMISE_IMPOSSIBLE');
    const created = await tx.cashRemittance.create({
      data: {
        courierId,
        courierName: orders[0].courierName,
        amount: remitTotal(orders),
        orderCount: orders.length,
        receivedById: staff.id,
        receivedByName: staff.name,
      },
    });
    // Seulement les courses encore non remises : deux agents ne peuvent pas compter deux fois le même argent
    const updated = await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) }, cashRemittanceId: null },
      data: { cashRemittanceId: created.id },
    });
    if (updated.count !== orders.length) throw new AppError(409, 'Ces espèces viennent d’être remises. La page est mise à jour.', 'REMISE_IMPOSSIBLE');
    return created;
  });
  return { remittance: { id: remittance.id, courierName: remittance.courierName, amount: remittance.amount, orderCount: remittance.orderCount } };
}
