import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { ACTIVE, STATUSES, transitionError } from './order-status.js';

const LIST_LIMIT = 100;

// Filtre de la liste : 'EN_COURS' (toutes les commandes non terminées), 'TOUTES', ou un statut précis
export function statusWhere(filter) {
  if (!filter || filter === 'EN_COURS') return { status: { in: ACTIVE } };
  if (filter === 'TOUTES') return {};
  if (STATUSES.includes(filter)) return { status: filter };
  throw new AppError(400, 'Filtre de statut inconnu.', 'FILTRE_INVALIDE');
}

// Recherche par référence, nom ou téléphone (« 76 12 34 56 » trouve +22676123456)
export function searchWhere(q) {
  const text = (q || '').trim();
  if (!text) return {};
  const or = [
    { reference: { contains: text.toUpperCase() } },
    { customerName: { contains: text, mode: 'insensitive' } },
  ];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 4) or.push({ customerPhone: { contains: digits } }, { paymentPayerPhone: { contains: digits } });
  return { OR: or };
}

export async function listOrders({ status, q }) {
  const where = { ...statusWhere(status), ...searchWhere(q) };
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      include: { items: { select: { quantity: true } } },
    }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  return {
    orders: orders.map((o) => ({
      reference: o.reference,
      status: o.status,
      createdAt: o.createdAt,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      paymentMethod: o.paymentMethod,
      itemsTotal: o.itemsTotal,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      hasLocation: o.latitude != null,
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  };
}

const DETAIL_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  statusChanges: { orderBy: { createdAt: 'asc' } },
};

export function toStaffOrder(o) {
  return {
    reference: o.reference,
    status: o.status,
    createdAt: o.createdAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    paymentMethod: o.paymentMethod,
    paymentPayerPhone: o.paymentPayerPhone,
    itemsTotal: o.itemsTotal,
    location: o.latitude != null ? { latitude: o.latitude, longitude: o.longitude, accuracy: o.locationAccuracy } : null,
    addressNote: o.addressNote,
    items: o.items.map((i) => ({
      productName: i.productName,
      productNumber: i.productNumber,
      variantLabel: i.variantLabel,
      choice: i.choice,
      note: i.note,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    history: o.statusChanges.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      by: h.staffName,
      at: h.createdAt,
    })),
  };
}

export async function getOrder(reference) {
  const order = await prisma.order.findUnique({ where: { reference }, include: DETAIL_INCLUDE });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return toStaffOrder(order);
}

// Change le statut. « from » est le statut que la personne voyait à l'écran : si quelqu'un d'autre
// a changé la commande entre-temps, on refuse au lieu d'écraser son action.
export async function changeStatus(reference, { from, to, reason }, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { reference }, select: { id: true, status: true } });
    if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
    if (from && from !== order.status) {
      throw new AppError(409, "Quelqu'un a déjà changé le statut de cette commande. La page est mise à jour.", 'STATUT_DEJA_CHANGE');
    }
    const error = transitionError(order.status, to, reason);
    if (error) throw new AppError(400, error, 'CHANGEMENT_IMPOSSIBLE');

    const updated = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: to } });
    if (updated.count !== 1) {
      throw new AppError(409, "Quelqu'un a déjà changé le statut de cette commande. La page est mise à jour.", 'STATUT_DEJA_CHANGE');
    }
    await tx.orderStatusChange.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: to,
        reason: to === 'ANNULEE' ? reason.trim() : null,
        staffUserId: staff.id,
        staffName: staff.name,
      },
    });
  });
  return getOrder(reference);
}
