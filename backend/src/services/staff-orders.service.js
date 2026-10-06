import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { customerAutoEnabled, messageContext } from '../config/env.js';
import {
  ACTIVE, deliveryError, feeAlreadyPaid, feeEditError, feeMethodError, feeVerifyError, paymentConfirmError, STATUSES, transitionError,
} from './order-status.js';
import { customerMessage, MESSAGE_KEYS, messageLabel, needsThanks, noticeError, noticeState, thanksWhere } from './customer-messages.js';
import { autoNotifyCustomer } from './whatsapp.service.js';
import { pushCourierAssigned, pushCourseCancelled, pushTeamDelivered } from './push.service.js';
import { codeLocked, courierAssignError, generateDeliveryCode, handoverReasonError, MAX_CODE_ATTEMPTS } from './courier.js';

const LIST_LIMIT = 100;

// Filtre de la liste : 'EN_COURS' (les 4 étapes en cours et les livrées à remercier), 'A_REMERCIER',
// 'TOUTES', ou un statut précis. 'LIVREE' = l'historique : livrées et déjà remerciées.
export function statusWhere(filter, { auto = false } = {}) {
  const thanks = thanksWhere({ auto });
  if (!filter || filter === 'EN_COURS') return thanks ? { OR: [{ status: { in: ACTIVE } }, thanks] } : { status: { in: ACTIVE } };
  if (filter === 'TOUTES') return {};
  if (filter === 'A_REMERCIER') return thanks || { id: { in: [] } };
  if (filter === 'LIVREE' && thanks) return { status: 'LIVREE', NOT: thanks };
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
  const auto = customerAutoEnabled();
  const where = { AND: [statusWhere(status, { auto }), searchWhere(q)] };
  const thanks = thanksWhere({ auto });
  const [orders, groups, toThank] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      include: {
        items: { select: { quantity: true } },
        // Pour savoir si une commande livrée attend encore son remerciement
        statusChanges: { where: { toStatus: 'LIVREE' }, select: { toStatus: true, createdAt: true } },
        events: { where: { messageKey: 'LIVREE' }, select: { type: true, messageKey: true, createdAt: true } },
      },
    }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    thanks ? prisma.order.count({ where: thanks }) : 0,
  ]);
  // Compteurs : les livrées à remercier ont leur propre étape, l'historique (LIVREE) compte les autres
  const counts = Object.fromEntries(groups.map((c) => [c.status, c._count._all]));
  counts.A_REMERCIER = toThank;
  if (counts.LIVREE) counts.LIVREE -= toThank;
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
      deliveryFeeMethod: o.deliveryFeeMethod,
      courierName: o.courierName,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      hasLocation: o.latitude != null,
      toThank: needsThanks(o, { auto }),
    })),
    counts,
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
    // Frais payés au livreur à la réception : comment (espèces / mobile money), vérification du mobile money
    // sur le téléphone marchand, remise des espèces au restaurant. feeAlreadyPaid : anciennes commandes,
    // frais payés avant le départ du livreur.
    deliveryFeeMethod: o.deliveryFeeMethod,
    deliveryFeeVerifiedAt: o.deliveryFeeVerifiedAt,
    cashRemitted: o.cashRemittanceId != null,
    feeAlreadyPaid: o.status !== 'LIVREE' && feeAlreadyPaid(o),
    // Livreur et code de remise. Le code est montré à l'équipe (il est dans le message « en route »,
    // et peut être dicté au client par appel), jamais au livreur.
    courier: o.courierName ? { id: o.courierId, name: o.courierName, assignedAt: o.courierAssignedAt } : null,
    deliveryCode: o.deliveryCode,
    codeAttempts: o.deliveryCodeAttempts,
    codeLocked: o.deliveryCode != null && codeLocked(o),
    maxCodeAttempts: MAX_CODE_ATTEMPTS,
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
      courierName: e.courierName,
      messageLabel: e.messageKey ? messageLabel(e.messageKey) : null,
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
      id: true, status: true, deliveryFee: true, deliveryFeeMethod: true, deliveryFeeVerifiedAt: true, courierId: true,
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
    where: {
      id: order.id,
      status: order.status,
      deliveryFee: order.deliveryFee,
      deliveryFeeMethod: order.deliveryFeeMethod,
      deliveryFeeVerifiedAt: order.deliveryFeeVerifiedAt,
      courierId: order.courierId,
    },
    data,
  });
  if (updated.count !== 1) throw new AppError(409, CHANGED, 'COMMANDE_DEJA_CHANGEE');
}

// Livreur choisi par l'agent : compte LIVREUR actif (courier.js)
async function findCourier(tx, order, courierId) {
  const courier = courierId ? await tx.staffUser.findUnique({ where: { id: courierId } }) : null;
  const error = courierAssignError(order, courier);
  if (error) throw new AppError(400, error, 'LIVREUR_IMPOSSIBLE');
  return courier;
}

const assignment = (courier) => ({ courierId: courier.id, courierName: courier.name, courierAssignedAt: new Date() });

export const statusChange = (order, to, staff, reason = null) => ({
  orderId: order.id, fromStatus: order.status, toStatus: to, reason, staffUserId: staff.id, staffName: staff.name,
});

// Change le statut. « from » est le statut que la personne voyait à l'écran : si quelqu'un d'autre
// a changé la commande entre-temps, on refuse au lieu d'écraser son action.
// Confirmation du paiement (PAYEE) : les frais de livraison sont donnés en même temps (deliveryFee).
// Départ (EN_LIVRAISON) : le livreur est choisi en même temps (courierId), et le code de remise créé.
// Livrée (LIVREE) depuis l'espace équipe : seulement quand le client n'a plus son code, avec un motif
// et la façon dont les frais ont été payés au livreur (feeMethod) ; le livreur, lui, valide avec le code
// (courier.service.js).
// Chaque étape, sauf l'annulation, demande que le client ait été prévenu de l'étape en cours.
export async function changeStatus(reference, { from, to, reason, deliveryFee, courierId, feeMethod }, staff) {
  let courier = null;
  let cancelledCourierId = null;
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    if (to === 'ANNULEE' && order.status === 'EN_LIVRAISON') cancelledCourierId = order.courierId;
    if (from && from !== order.status) {
      throw new AppError(409, "Quelqu'un a déjà changé le statut de cette commande. La page est mise à jour.", 'STATUT_DEJA_CHANGE');
    }
    const fee = to === 'PAYEE' ? deliveryFee ?? order.deliveryFee : order.deliveryFee;
    const error =
      transitionError(order.status, to, reason) ||
      (to !== 'ANNULEE' ? noticeError(notice(order)) : null) ||
      (to === 'PAYEE' ? paymentConfirmError(fee) : null) ||
      (to === 'EN_LIVRAISON' ? deliveryError(order) : null) ||
      (to === 'LIVREE' ? handoverReasonError(reason) || feeMethodError(order, feeMethod) : null);
    if (error) throw new AppError(400, error, 'CHANGEMENT_IMPOSSIBLE');
    if (to === 'EN_LIVRAISON') courier = await findCourier(tx, order, courierId);

    await guardedUpdate(tx, order, {
      status: to,
      ...(to === 'PAYEE' ? { deliveryFee: fee } : {}),
      ...(courier ? { ...assignment(courier), deliveryCode: generateDeliveryCode(), deliveryCodeAttempts: 0 } : {}),
      ...(to === 'LIVREE' && !feeAlreadyPaid(order) ? { deliveryFeeMethod: feeMethod } : {}),
    });
    const withReason = to === 'ANNULEE' || to === 'LIVREE';
    await tx.orderStatusChange.create({ data: statusChange(order, to, staff, withReason ? reason.trim() : null) });
    if (to === 'PAYEE' && fee !== order.deliveryFee) {
      await tx.orderEvent.create({ data: event(order.id, 'FRAIS_SAISIS', staff, { amount: fee }) });
    }
    if (courier) await tx.orderEvent.create({ data: event(order.id, 'LIVREUR_ASSIGNE', staff, { courierName: courier.name }) });
    if (to === 'LIVREE') await tx.orderEvent.create({ data: event(order.id, 'LIVRAISON_SANS_CODE', staff) });
  });
  if (courier) notifyCourier(reference, courier.id);
  if (to === 'LIVREE') notifyDelivered(reference, staff);
  if (cancelledCourierId) notifyCourier(reference, cancelledCourierId, pushCourseCancelled);
  return afterChange(reference);
}

// Remplacement du livreur pendant la livraison (panne, absence) : le code reste le même,
// l'ancien livreur ne voit plus la course, le nouveau est prévenu.
export async function reassignCourier(reference, courierId, staff) {
  let courier = null;
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    if (order.status !== 'EN_LIVRAISON') throw new AppError(400, 'Le livreur se remplace seulement pendant la livraison.', 'LIVREUR_IMPOSSIBLE');
    courier = await findCourier(tx, order, courierId);
    await guardedUpdate(tx, order, assignment(courier));
    await tx.orderEvent.create({ data: event(order.id, 'LIVREUR_ASSIGNE', staff, { courierName: courier.name }) });
  });
  notifyCourier(reference, courier.id);
  return getOrder(reference);
}

// Livreurs proposés au départ d'une commande, avec le nombre de courses qu'ils ont en cours
export async function listCouriers() {
  const couriers = await prisma.staffUser.findMany({
    where: { role: 'LIVREUR', isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, phone: true, _count: { select: { courses: { where: { status: 'EN_LIVRAISON' } } } } },
  });
  return couriers.map(({ _count, ...c }) => ({ ...c, activeCourses: _count.courses }));
}

// Commande livrée (par le livreur avec le code, ou validée sans code par un agent) : notification à
// l'équipe, pour remercier le client. N'échoue jamais. byAgent : l'agent qui a validé sans code.
export function notifyDelivered(reference, byAgent = null) {
  prisma.order
    .findUnique({
      where: { reference },
      select: { id: true, reference: true, courierName: true, statusChanges: { where: { toStatus: 'LIVREE' }, select: { createdAt: true } } },
    })
    .then((order) => order && pushTeamDelivered(order, {
      courierName: order.courierName,
      at: order.statusChanges.at(-1)?.createdAt || new Date(),
      byAgent: byAgent?.name || null,
      auto: customerAutoEnabled(),
    }))
    .catch((e) => console.error('[push] livrée', e));
}

// Notification au livreur : nouvelle course, ou course annulée (n'échoue jamais)
function notifyCourier(reference, courierId, send = pushCourierAssigned) {
  prisma.order
    .findUnique({ where: { reference }, select: { id: true, reference: true, items: { select: { quantity: true } } } })
    .then((order) => order && send(order, courierId))
    .catch((e) => console.error('[push] course', e));
}

// Modification du montant des frais (Patron et Opérateur), tant que le livreur n'est pas parti.
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

// Frais payés par mobile money au numéro marchand : l'agent coche après vérification sur le téléphone
// marchand (page Caisse, onglet « Frais à vérifier »). Décocher reste possible (erreur de manipulation).
export async function setFeeVerified(reference, verified, staff) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    const error = feeVerifyError(order, verified);
    if (error) throw new AppError(400, error, 'FRAIS_IMPOSSIBLES');
    await guardedUpdate(tx, order, { deliveryFeeVerifiedAt: verified ? new Date() : null });
    await tx.orderEvent.create({ data: event(order.id, verified ? 'FRAIS_VERIFIES' : 'FRAIS_NON_VERIFIES', staff, { amount: order.deliveryFee }) });
  });
  return getOrder(reference);
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
