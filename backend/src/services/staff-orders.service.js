import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { messageContext } from '../config/env.js';
import { ACTIVE, deliveryError, feeEditError, feeReceivedError, STATUSES, transitionError } from './order-status.js';
import { customerMessage, MESSAGE_KEYS, MESSAGES } from './customer-messages.js';
import { autoNotifyCustomer } from './whatsapp.service.js';

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
      deliveryFee: o.deliveryFee,
      deliveryFeeReceived: o.deliveryFeeReceivedAt != null,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      hasLocation: o.latitude != null,
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  };
}

const DETAIL_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  statusChanges: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
};

// Motif de la dernière annulation (pour le message au client)
const withCancelReason = (o) => ({ ...o, cancelReason: o.statusChanges.findLast((h) => h.toStatus === 'ANNULEE')?.reason || null });

export function toStaffOrder(order) {
  const o = withCancelReason(order);
  return {
    reference: o.reference,
    status: o.status,
    createdAt: o.createdAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    paymentMethod: o.paymentMethod,
    paymentPayerPhone: o.paymentPayerPhone,
    itemsTotal: o.itemsTotal,
    deliveryFee: o.deliveryFee,
    deliveryFeeReceivedAt: o.deliveryFeeReceivedAt,
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
    // Frais saisis, frais reçus, messages préparés : affichés avec l'historique des statuts
    events: o.events.map((e) => ({
      type: e.type,
      amount: e.amount,
      messageKey: e.messageKey,
      messageLabel: e.messageKey ? MESSAGES[e.messageKey]?.label || e.messageKey : null,
      by: e.staffName,
      at: e.createdAt,
    })),
    // Message WhatsApp de l'étape en cours, prêt à ouvrir (voir customer-messages.js)
    customerMessage: customerMessage(o, messageContext()),
  };
}

// Après chaque changement : message automatique au client, s'il est activé (voir whatsapp.service.js)
async function afterChange(reference) {
  const order = await prisma.order.findUnique({ where: { reference }, include: DETAIL_INCLUDE });
  autoNotifyCustomer(withCancelReason(order)).catch((e) => console.error('[whatsapp]', e));
  return toStaffOrder(order);
}

const event = (orderId, type, staff, extra = {}) => ({ orderId, type, staffUserId: staff.id, staffName: staff.name, ...extra });
const CHANGED = "Quelqu'un vient de modifier cette commande. La page est mise à jour.";

export async function getOrder(reference) {
  const order = await prisma.order.findUnique({ where: { reference }, include: DETAIL_INCLUDE });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return toStaffOrder(order);
}

// Change le statut. « from » est le statut que la personne voyait à l'écran : si quelqu'un d'autre
// a changé la commande entre-temps, on refuse au lieu d'écraser son action.
export async function changeStatus(reference, { from, to, reason }, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { reference },
      select: { id: true, status: true, deliveryFee: true, deliveryFeeReceivedAt: true },
    });
    if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
    if (from && from !== order.status) {
      throw new AppError(409, "Quelqu'un a déjà changé le statut de cette commande. La page est mise à jour.", 'STATUT_DEJA_CHANGE');
    }
    const error = transitionError(order.status, to, reason) || (to === 'EN_LIVRAISON' ? deliveryError(order) : null);
    if (error) throw new AppError(400, error, 'CHANGEMENT_IMPOSSIBLE');

    // Mêmes frais qu'au moment de la vérification : personne ne les a décochés entre-temps
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status, deliveryFee: order.deliveryFee, deliveryFeeReceivedAt: order.deliveryFeeReceivedAt },
      data: { status: to },
    });
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
  return afterChange(reference);
}

async function findForFee(tx, reference) {
  const order = await tx.order.findUnique({
    where: { reference },
    select: { id: true, status: true, deliveryFee: true, deliveryFeeReceivedAt: true },
  });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return order;
}

// Saisie ou modification du montant des frais de livraison (Patron et Opérateur)
export async function setDeliveryFee(reference, amount, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await findForFee(tx, reference);
    const error = feeEditError(order);
    if (error) throw new AppError(400, error, 'FRAIS_IMPOSSIBLES');
    if (order.deliveryFee === amount) return;
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status, deliveryFee: order.deliveryFee, deliveryFeeReceivedAt: null },
      data: { deliveryFee: amount },
    });
    if (updated.count !== 1) throw new AppError(409, CHANGED, 'COMMANDE_DEJA_CHANGEE');
    await tx.orderEvent.create({ data: event(order.id, 'FRAIS_SAISIS', staff, { amount }) });
  });
  return afterChange(reference);
}

// Cocher ou décocher « Frais reçus » (après vérification sur le téléphone marchand)
export async function setFeeReceived(reference, received, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await findForFee(tx, reference);
    const error = feeReceivedError(order, received);
    if (error) throw new AppError(400, error, 'FRAIS_IMPOSSIBLES');
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status, deliveryFee: order.deliveryFee, deliveryFeeReceivedAt: order.deliveryFeeReceivedAt },
      data: { deliveryFeeReceivedAt: received ? new Date() : null },
    });
    if (updated.count !== 1) throw new AppError(409, CHANGED, 'COMMANDE_DEJA_CHANGEE');
    await tx.orderEvent.create({ data: event(order.id, received ? 'FRAIS_RECUS' : 'FRAIS_NON_RECUS', staff) });
  });
  return afterChange(reference);
}

// Un agent a ouvert WhatsApp avec le message de l'étape : noté dans l'historique.
// (WhatsApp ne dit pas si le message a vraiment été envoyé : on note qu'il a été préparé.)
export async function logMessagePrepared(reference, key, staff) {
  if (!MESSAGE_KEYS.includes(key)) throw new AppError(400, 'Message inconnu.', 'MESSAGE_INCONNU');
  const order = await prisma.order.findUnique({ where: { reference }, select: { id: true } });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  await prisma.orderEvent.create({ data: event(order.id, 'MESSAGE_PREPARE', staff, { messageKey: key }) });
}
