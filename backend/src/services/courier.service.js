// Espace livreur : ses courses du jour et la remise avec le code (règles dans courier.js)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { checkHandover, startOfToday, toCourse } from './courier.js';
import { feeAlreadyPaid, feeMethodError } from './order-status.js';
import { notifyDelivered, statusChange } from './staff-orders.service.js';

// Courses en cours, plus celles livrées ou annulées aujourd'hui
export async function listCourses(courier, now = new Date()) {
  const orders = await prisma.order.findMany({
    where: {
      courierId: courier.id,
      OR: [{ status: 'EN_LIVRAISON' }, { status: { in: ['LIVREE', 'ANNULEE'] }, updatedAt: { gte: startOfToday(now) } }],
    },
    orderBy: { courierAssignedAt: 'asc' },
    include: {
      items: { orderBy: { id: 'asc' }, include: { drinks: true } },
      statusChanges: { where: { toStatus: 'LIVREE' }, select: { toStatus: true, createdAt: true } },
    },
  });
  const courses = orders.map(toCourse);
  // En cours d'abord (la plus ancienne en premier), puis les terminées (la plus récente en premier)
  return [
    ...courses.filter((c) => c.status === 'EN_LIVRAISON'),
    ...courses.filter((c) => c.status !== 'EN_LIVRAISON').reverse(),
  ];
}

// Le livreur tape le code du client et indique comment les frais ont été payés (feeMethod : ESPECES
// ou MOBILE_MONEY, obligatoire). Bon code : LIVREE. Code faux : compté, bloqué après 5.
export async function deliverWithCode(reference, code, feeMethod, courier) {
  const order = await prisma.order.findUnique({
    where: { reference },
    select: { id: true, status: true, courierId: true, deliveryCode: true, deliveryCodeAttempts: true, deliveryFeeMethod: true },
  });
  if (!order || order.courierId !== courier.id) throw new AppError(404, 'Course introuvable.', 'COURSE_INTROUVABLE');
  // Mode de paiement des frais vérifié avant le code : un oubli ne compte pas comme un code faux
  const feeError = order.status === 'EN_LIVRAISON' ? feeMethodError(order, feeMethod) : null;
  if (feeError) throw new AppError(400, feeError, 'FRAIS_MANQUANTS');
  const result = checkHandover(order, courier.id, code);
  const who = { staffUserId: courier.id, staffName: courier.name };

  if (!result.ok) {
    if (result.wrong) {
      await prisma.$transaction([
        prisma.order.updateMany({
          where: { id: order.id, deliveryCodeAttempts: order.deliveryCodeAttempts },
          data: { deliveryCodeAttempts: { increment: 1 } },
        }),
        prisma.orderEvent.create({ data: { orderId: order.id, type: 'CODE_INCORRECT', ...who } }),
      ]);
    }
    throw new AppError(400, result.error, result.wrong ? 'CODE_INCORRECT' : 'REMISE_IMPOSSIBLE');
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: 'EN_LIVRAISON', courierId: courier.id },
      data: { status: 'LIVREE', ...(feeAlreadyPaid(order) ? {} : { deliveryFeeMethod: feeMethod }) },
    });
    if (updated.count !== 1) throw new AppError(409, 'Cette course vient de changer. La page est mise à jour.', 'COURSE_CHANGEE');
    await tx.orderStatusChange.create({ data: statusChange(order, 'LIVREE', courier) });
  });
  notifyDelivered(reference);
  return (await listCourses(courier)).find((c) => c.reference === reference);
}
