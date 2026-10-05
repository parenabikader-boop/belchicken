import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { customerAutoEnabled, messageContext } from '../config/env.js';
import {
  ACTIVE, deliveryError, feeEditError, feeReceivedError, paymentConfirmError, preparationError, STATUSES, transitionError,
} from './order-status.js';
import { customerMessage, MESSAGE_KEYS, MESSAGES, noticeError, noticeState } from './customer-messages.js';
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

const notice = (o) => noticeState(o, { auto: customerAutoEnabled() });

export function toStaffOrder(order) {
  const o = withCancelReason(order);
  const state = notice(o);
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
    // Frais, messages préparés et envois confirmés : affichés avec l'historique des statuts
    events: o.events.map((e) => ({
      type: e.type,
      amount: e.amount,
      messageKey: e.messageKey,
      messageLabel: e.messageKey ? MESSAGES[e.messageKey]?.label || e.messageKey : null,
      by: e.staffName,
      at: e.createdAt,
    })),
    // Message de l'étape en cours : texte et lien WhatsApp (customer-messages.js), et s'il a été confirmé.
    // required = l'étape suivante est bloquée tant que l'envoi n'est pas confirmé.
    notice: state && {
      ...customerMessage(o, messageContext()),
      required: state.required,
      confirmed: state.confirmed && { type: state.confirmed.type, by: state.confirmed.staffName, at: state.confirmed.createdAt },
      auto: customerAutoEnabled(),
    },
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

// Commande lue dans une transaction, avec ce qu'il faut pour les règles (statuts et événements)
async function findForRules(tx, reference) {
  const order = await tx.order.findUnique({
    where: { reference },
    select: {
      id: true, status: true, deliveryFee: true, deliveryFeeReceivedAt: true,
      statusChanges: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      events: { select: { type: true, messageKey: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return order;
}

// Écriture protégée : refusée si quelqu'un a changé le statut ou les frais depuis la lecture
async function guardedUpdate(tx, order, data) {
  const updated = await tx.order.updateMany({
    where: { id: order.id, status: order.status, deliveryFee: order.deliveryFee, deliveryFeeReceivedAt: order.deliveryFeeReceivedAt },
    data,
  });
  if (updated.count !== 1) throw new AppError(409, CHANGED, 'COMMANDE_DEJA_CHANGEE');
}

const statusChange = (order, to, staff, reason = null) => ({
  orderId: order.id, fromStatus: order.status, toStatus: to, reason, staffUserId: staff.id, staffName: staff.name,
});

// Change le statut. « from » est le statut que la personne voyait à l'écran : si quelqu'un d'autre
// a changé la commande entre-temps, on refuse au lieu d'écraser son action.
// Confirmation du paiement (PAYEE) : les frais de livraison sont donnés en même temps (deliveryFee).
// Chaque étape, sauf l'annulation, demande que le client ait été prévenu de l'étape en cours.
export async function changeStatus(reference, { from, to, reason, deliveryFee }, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    if (from && from !== order.status) {
      throw new AppError(409, "Quelqu'un a déjà changé le statut de cette commande. La page est mise à jour.", 'STATUT_DEJA_CHANGE');
    }
    const fee = to === 'PAYEE' ? deliveryFee ?? order.deliveryFee : order.deliveryFee;
    const error =
      transitionError(order.status, to, reason) ||
      (to !== 'ANNULEE' ? noticeError(notice(order)) : null) ||
      (to === 'PAYEE' ? paymentConfirmError(fee) : null) ||
      (to === 'EN_PREPARATION' ? preparationError(order) : null) ||
      (to === 'EN_LIVRAISON' ? deliveryError(order) : null);
    if (error) throw new AppError(400, error, 'CHANGEMENT_IMPOSSIBLE');

    await guardedUpdate(tx, order, { status: to, ...(to === 'PAYEE' ? { deliveryFee: fee } : {}) });
    await tx.orderStatusChange.create({ data: statusChange(order, to, staff, to === 'ANNULEE' ? reason.trim() : null) });
    if (to === 'PAYEE' && fee !== order.deliveryFee) {
      await tx.orderEvent.create({ data: event(order.id, 'FRAIS_SAISIS', staff, { amount: fee }) });
    }
  });
  return afterChange(reference);
}

// Modification du montant des frais (Patron et Opérateur), avant leur réception.
// Après la confirmation du paiement, un nouveau montant demande un nouveau message au client.
export async function setDeliveryFee(reference, amount, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    const error = feeEditError(order);
    if (error) throw new AppError(400, error, 'FRAIS_IMPOSSIBLES');
    if (order.deliveryFee === amount) return;
    await guardedUpdate(tx, order, { deliveryFee: amount });
    await tx.orderEvent.create({ data: event(order.id, 'FRAIS_SAISIS', staff, { amount }) });
  });
  return afterChange(reference);
}

// Cocher « Frais reçus » (après vérification sur le téléphone marchand) : la préparation commence,
// le client doit en être prévenu. Décocher (erreur de manipulation) reste possible avant le départ du livreur.
export async function setFeeReceived(reference, received, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    const error = feeReceivedError(order, received) || (received ? noticeError(notice(order)) : null);
    if (error) throw new AppError(400, error, 'FRAIS_IMPOSSIBLES');
    const startPreparation = received && order.status === 'PAYEE';
    await guardedUpdate(tx, order, { deliveryFeeReceivedAt: received ? new Date() : null, ...(startPreparation ? { status: 'EN_PREPARATION' } : {}) });
    await tx.orderEvent.create({ data: event(order.id, received ? 'FRAIS_RECUS' : 'FRAIS_NON_RECUS', staff) });
    if (startPreparation) await tx.orderStatusChange.create({ data: statusChange(order, 'EN_PREPARATION', staff) });
  });
  return afterChange(reference);
}

// Un agent a ouvert WhatsApp avec le message de l'étape : noté dans l'historique.
// (WhatsApp ne dit pas si le message a vraiment été envoyé : l'agent le confirme ensuite.)
export async function logMessagePrepared(reference, key, staff) {
  if (!MESSAGE_KEYS.includes(key)) throw new AppError(400, 'Message inconnu.', 'MESSAGE_INCONNU');
  const order = await prisma.order.findUnique({ where: { reference }, select: { id: true } });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  await prisma.orderEvent.create({ data: event(order.id, 'MESSAGE_PREPARE', staff, { messageKey: key }) });
}

// L'agent confirme que le client est prévenu de l'étape en cours : message WhatsApp envoyé
// (by = 'WHATSAPP') ou client prévenu par appel (by = 'APPEL'). Débloque l'étape suivante.
export async function confirmNotice(reference, { key, by }, staff) {
  const order = await findForRules(prisma, reference);
  const state = notice(order);
  if (!state || state.key !== key) throw new AppError(409, 'La commande a changé d’étape. La page est mise à jour.', 'ETAPE_CHANGEE');
  if (state.missing) throw new AppError(400, state.missing, 'MESSAGE_INCOMPLET');
  if (!state.confirmed) {
    await prisma.orderEvent.create({ data: event(order.id, by === 'APPEL' ? 'CLIENT_APPELE' : 'MESSAGE_ENVOYE', staff, { messageKey: key }) });
  }
  return getOrder(reference);
}
