import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { customerAutoEnabled, messageContext } from '../config/env.js';
import {
  ACTIVE, deliveryError, feeAlreadyPaid, isShortcut, SHORTCUT_OFF, feeMethodError, feeToCollect, feeVerifyError, isPickup, paymentConfirmError, STATUSES, transitionError,
} from './order-status.js';
import { feeCorrectionError, feeEditRight, isNightTime, minutesToHHMM, nightFeeAfter } from './delivery-fees.js';
import { loadGrid } from './delivery-fees.service.js';
import { getAppSettings } from './app-settings.service.js';
import { featureClosedError, getFeatures } from './features.service.js';
import { historyCutoff } from './features.js';
import { customerMessage, MESSAGE_KEYS, messageLabel, needsThanks, noticeError, noticeState, THANKS_KEYS, thanksWhere } from './customer-messages.js';
import { autoNotifyCustomer } from './whatsapp.service.js';
import { messageContextFor } from './delivery-mode.service.js';
import { pushCourierAssigned, pushCourseCancelled, pushTeamDelivered } from './push.service.js';
import { enteredBy, paymentVerification, sendFrom, sourceLabel } from './order-sources.js';
import { checkPickupCode, codeLocked, courierAssignError, generateDeliveryCode, handoverReasonError, MAX_CODE_ATTEMPTS } from './courier.js';
import { isAvailabilityActive } from './courier-team.service.js';
import { feeOperatorError } from './cash.js';

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

// Lot 4, historique fermé par le Prestataire : seulement les commandes en cours, à remercier, et celles
// terminées (livrées ou annulées) depuis moins de 24 heures. {} = historique ouvert, tout est visible.
export function visibleWhere(historyOpen, { auto = false, now = new Date() } = {}) {
  if (historyOpen) return {};
  const thanks = thanksWhere({ auto });
  return {
    OR: [
      { status: { in: ACTIVE } },
      ...(thanks ? [thanks] : []),
      { statusChanges: { some: { toStatus: { in: ['LIVREE', 'ANNULEE'] }, createdAt: { gte: historyCutoff(now) } } } },
    ],
  };
}

export async function listOrders({ status, q }) {
  const auto = customerAutoEnabled();
  const historyOpen = (await getFeatures()).HISTORIQUE;
  const visible = visibleWhere(historyOpen, { auto });
  const where = { AND: [statusWhere(status, { auto }), searchWhere(q), visible] };
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
        events: { where: { messageKey: { in: THANKS_KEYS } }, select: { type: true, messageKey: true, createdAt: true } },
      },
    }),
    prisma.order.groupBy({ by: ['status'], where: visible, _count: { _all: true } }),
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
      mode: o.mode,
      createdAt: o.createdAt,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      paymentMethod: o.paymentMethod,
      itemsTotal: o.itemsTotal,
      deliveryFee: o.deliveryFee,
      deliveryNightFee: o.deliveryNightFee,
      deliveryFeeMethod: o.deliveryFeeMethod,
      deliveryFeeSource: o.deliveryFeeSource,
      deliveryZoneName: o.deliveryZoneName,
      courierName: o.courierName,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      // Lot 2 : provenance et agent qui a saisi (vides = commande passée sur le site)
      sourceName: o.sourceName,
      enteredBy: enteredBy(o),
      hasLocation: o.latitude != null,
      toThank: needsThanks(o, { auto }),
    })),
    counts,
    historyOpen, // lot 4 : false = historique limité aux 24 dernières heures
  };
}

const DETAIL_INCLUDE = {
  items: { orderBy: { id: 'asc' }, include: { drinks: true } },
  statusChanges: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  // Provenance WhatsApp : le numéro depuis lequel écrire au client (lot 2)
  source: { select: { kind: true, phone: true } },
};

// Motif de la dernière annulation (pour le message au client)
const withCancelReason = (o) => ({ ...o, cancelReason: o.statusChanges.findLast((h) => h.toStatus === 'ANNULEE')?.reason || null });

const notice = (o) => noticeState(o, { auto: customerAutoEnabled() });

// night : heures de nuit réglées (null = réglage éteint), pour le rappel « commande passée de nuit »
// ctx : contexte des messages (lot 5 : avec nos codes pour une commande en mode Prestataire, messageContextFor)
export function toStaffOrder(order, night = null, ctx = messageContext()) {
  const o = withCancelReason(order);
  const state = notice(o);
  const from = sendFrom(o);
  const verified = paymentVerification(o);
  return {
    reference: o.reference,
    status: o.status,
    mode: o.mode,
    // Lot 5 : qui livre et encaisse les frais (RESTAURANT ou PRESTATAIRE), figé à la création
    deliveryOperator: o.deliveryOperator ?? 'RESTAURANT',
    createdAt: o.createdAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    paymentMethod: o.paymentMethod,
    paymentPayerPhone: o.paymentPayerPhone,
    // Lot 2 : provenance (« Site » si vide), agent qui a saisi la commande (null = le client sur le site),
    // agent qui a vérifié le paiement, et numéro WhatsApp du restaurant depuis lequel écrire au client
    source: sourceLabel(o),
    enteredBy: enteredBy(o),
    paymentVerified: verified && { by: verified.by, at: verified.at },
    sendFrom: from,
    itemsTotal: o.itemsTotal,
    deliveryFee: o.deliveryFee,
    // Lot 3 : part du supplément de nuit dans deliveryFee (null = aucun)
    deliveryNightFee: o.deliveryNightFee,
    // Commande passée pendant les heures de nuit (réglage allumé) : rappel à l'agent qui saisit les frais
    nightOrder: night && isNightTime(night, new Date(o.createdAt)) ? { from: minutesToHHMM(night.startMin), to: minutesToHHMM(night.endMin) } : null,
    // Frais payés au livreur à la réception : comment (espèces / mobile money), vérification du mobile money
    // sur le téléphone marchand, remise des espèces au restaurant. feeAlreadyPaid : anciennes commandes,
    // frais payés avant le départ du livreur.
    deliveryFeeMethod: o.deliveryFeeMethod,
    deliveryFeeVerifiedAt: o.deliveryFeeVerifiedAt,
    cashRemitted: o.cashRemittanceId != null,
    feeAlreadyPaid: o.status !== 'LIVREE' && feeAlreadyPaid(o),
    // Grille des frais : d'où viennent les frais (QUARTIER, DISTANCE, A_CONFIRMER, AGENT), quartier et distance
    // copiés à la commande. feeEdit : qui peut encore les corriger ('TOUS', 'PATRON' ou null).
    deliveryFeeSource: o.deliveryFeeSource,
    deliveryZoneName: o.deliveryZoneName,
    deliveryDistanceM: o.deliveryDistanceM,
    feeEdit: feeEditRight(o).who,
    // Livreur et code de remise (ou de retrait, à emporter). Le code est montré à l'équipe (il est dans
    // le message « en route » ou « prête », et peut être dicté au client par appel), jamais au livreur.
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
      // Boissons choisies, pour une formule (à multiplier par quantity)
      drinks: (i.drinks || []).map((d) => ({ name: d.name, quantity: d.quantity })),
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
      previousAmount: e.previousAmount,
      reason: e.reason,
      messageKey: e.messageKey,
      courierName: e.courierName,
      messageLabel: e.messageKey ? messageLabel(e.messageKey) : null,
      by: e.staffName,
      at: e.createdAt,
    })),
    // Message de l'étape en cours : texte et lien WhatsApp (customer-messages.js), et s'il a été confirmé.
    // required = l'étape suivante est bloquée tant que l'envoi n'est pas confirmé.
    notice: state && {
      ...customerMessage(o, ctx),
      sendFrom: from,
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
  return toStaffOrder(order, (await loadGrid()).night, await messageContextFor(order));
}

const event = (orderId, type, staff, extra = {}) => ({ orderId, type, staffUserId: staff.id, staffName: staff.name, ...extra });
const CHANGED = "Quelqu'un vient de modifier cette commande. La page est mise à jour.";

// Frais saisis pour la première fois (FRAIS_SAISIS) ou corrigés, avec le motif et l'ancien montant (FRAIS_CORRIGES)
const feeEvent = (order, amount, staff, reason) =>
  order.deliveryFee == null
    ? event(order.id, 'FRAIS_SAISIS', staff, { amount })
    : event(order.id, 'FRAIS_CORRIGES', staff, { amount, previousAmount: order.deliveryFee, reason: reason?.trim() || null });

// Lot 4 : historique fermé, une ancienne commande ne s'ouvre plus (ni détail, ni bon)
export async function getOrder(reference, { checkHistory = false } = {}) {
  const order = await prisma.order.findUnique({ where: { reference }, include: DETAIL_INCLUDE });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  if (checkHistory && !(await getFeatures()).HISTORIQUE) {
    const visible = await prisma.order.count({ where: { id: order.id, ...visibleWhere(false, { auto: customerAutoEnabled() }) } });
    if (!visible) throw featureClosedError();
  }
  return toStaffOrder(order, (await loadGrid()).night, await messageContextFor(order));
}

// Commande lue dans une transaction, avec ce qu'il faut pour les règles (statuts et événements)
async function findForRules(tx, reference) {
  const order = await tx.order.findUnique({
    where: { reference },
    select: {
      id: true, status: true, mode: true, deliveryFee: true, deliveryNightFee: true, deliveryFeeMethod: true, deliveryFeeVerifiedAt: true, courierId: true,
      cashRemittanceId: true, deliveryOperator: true,
      deliveryCode: true, deliveryCodeAttempts: true, shortFlow: true,
      createdById: true, // commande saisie par un agent : message « à payer » facultatif
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
      cashRemittanceId: order.cashRemittanceId,
      courierId: order.courierId,
    },
    data,
  });
  if (updated.count !== 1) throw new AppError(409, CHANGED, 'COMMANDE_DEJA_CHANGEE');
}

// Livreur choisi par l'agent : compte LIVREUR actif (courier.js), de l'équipe du mode de la commande et
// pas en pause quand la disponibilité est active (lot 5b, courier-team.js)
async function findCourier(tx, order, courierId) {
  const courier = courierId ? await tx.staffUser.findUnique({ where: { id: courierId } }) : null;
  const active = await isAvailabilityActive(order.deliveryOperator, tx);
  const error = courierAssignError(order, courier, { active });
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
// À emporter : PRETE (« Commande prête », message avec l'adresse et le code de retrait), puis LIVREE
// quand l'agent remet la commande au comptoir : il tape le code donné par le client (code), ou, client
// sans son code, valide avec un motif (reason, événement RETRAIT_SANS_CODE). Jamais de frais.
// Chaque étape, sauf l'annulation, demande que le client ait été prévenu de l'étape en cours.
// nightFee : « dont supplément de nuit » saisi avec les frais (lot 3, facultatif, voir nightFeeAfter).
export async function changeStatus(reference, { from, to, reason, deliveryFee, nightFee, feeReason, courierId, feeMethod, code }, staff) {
  let courier = null;
  let cancelledCourierId = null;
  let wrongCode = null;
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    if (to === 'ANNULEE' && order.status === 'EN_LIVRAISON') cancelledCourierId = order.courierId;
    if (from && from !== order.status) {
      throw new AppError(409, "Quelqu'un a déjà changé le statut de cette commande. La page est mise à jour.", 'STATUT_DEJA_CHANGE');
    }
    const pickup = isPickup(order);
    // Parcours court : vérification du paiement et lancement de la préparation en une fois (si le réglage est allumé)
    const shortcut = isShortcut(order.status, to);
    if (shortcut && !(await getAppSettings(tx)).shortFlow) throw new AppError(400, SHORTCUT_OFF, 'CHANGEMENT_IMPOSSIBLE');
    const paying = to === 'PAYEE' || shortcut; // règles de la confirmation du paiement
    // Retrait au comptoir : avec le code du client, ou sans code avec un motif
    const counter = to === 'LIVREE' && pickup;
    const withCode = counter && !reason?.trim();
    const fee = pickup ? deliveryFee ?? null : paying ? deliveryFee ?? order.deliveryFee : order.deliveryFee;
    const night = paying && !pickup ? nightFeeAfter(order, fee, nightFee) : null;
    const error =
      transitionError(order.status, shortcut ? 'PAYEE' : to, reason, order.mode) ||
      (to !== 'ANNULEE' ? noticeError(notice(order)) : null) ||
      (paying ? paymentConfirmError(fee, order.mode, order.deliveryFee) : null) ||
      night?.error ||
      // Frais de la grille changés par l'agent en confirmant le paiement : c'est une correction, avec un motif
      (paying && !pickup && order.deliveryFee != null && fee !== order.deliveryFee && (!feeReason || feeReason.trim().length < 3)
        ? 'Vous changez les frais calculés pour ce quartier : indiquez le motif.'
        : null) ||
      (to === 'EN_LIVRAISON' ? deliveryError(order) : null) ||
      (to === 'LIVREE' && !pickup ? handoverReasonError(reason) || feeMethodError(order, feeMethod) : null) ||
      (withCode && !code ? 'Tapez le code de retrait du client, ou validez sans code avec un motif.' : null) ||
      (counter && !withCode ? handoverReasonError(reason, true) : null);
    if (error) throw new AppError(400, error, 'CHANGEMENT_IMPOSSIBLE');
    if (to === 'EN_LIVRAISON') courier = await findCourier(tx, order, courierId);
    if (withCode) {
      const result = checkPickupCode(order, code);
      if (!result.ok) {
        // Code faux : compté (5 au plus) et noté, puis refusé après l'enregistrement
        if (result.wrong) {
          const counted = await tx.order.updateMany({
            where: { id: order.id, status: 'PRETE', deliveryCodeAttempts: order.deliveryCodeAttempts },
            data: { deliveryCodeAttempts: { increment: 1 } },
          });
          if (counted.count !== 1) throw new AppError(409, CHANGED, 'COMMANDE_DEJA_CHANGEE');
          await tx.orderEvent.create({ data: event(order.id, 'CODE_INCORRECT', staff) });
          wrongCode = result.error;
          return;
        }
        throw new AppError(400, result.error, 'REMISE_IMPOSSIBLE');
      }
    }

    await guardedUpdate(tx, order, {
      status: to,
      ...(shortcut ? { shortFlow: true } : {}),
      ...(paying && !pickup
        ? { deliveryFee: fee, deliveryNightFee: night.nightFee, ...(fee !== order.deliveryFee ? { deliveryFeeSource: 'AGENT' } : {}) }
        : {}),
      ...(courier ? { ...assignment(courier), deliveryCode: generateDeliveryCode(), deliveryCodeAttempts: 0 } : {}),
      ...(to === 'PRETE' ? { deliveryCode: generateDeliveryCode(), deliveryCodeAttempts: 0 } : {}),
      ...(to === 'LIVREE' && feeToCollect(order) ? { deliveryFeeMethod: feeMethod } : {}),
    });
    const withReason = to === 'ANNULEE' || (to === 'LIVREE' && !withCode);
    // Parcours court : les deux étapes dans l'historique (« Payée », puis « En préparation »), comme le parcours normal
    if (shortcut) await tx.orderStatusChange.create({ data: statusChange(order, 'PAYEE', staff) });
    await tx.orderStatusChange.create({ data: statusChange(shortcut ? { ...order, status: 'PAYEE' } : order, to, staff, withReason ? reason.trim() : null) });
    if (paying && !pickup && fee !== order.deliveryFee) await tx.orderEvent.create({ data: feeEvent(order, fee, staff, feeReason) });
    if (courier) await tx.orderEvent.create({ data: event(order.id, 'LIVREUR_ASSIGNE', staff, { courierName: courier.name }) });
    if (to === 'LIVREE' && !pickup) await tx.orderEvent.create({ data: event(order.id, 'LIVRAISON_SANS_CODE', staff) });
    if (counter && !withCode) await tx.orderEvent.create({ data: event(order.id, 'RETRAIT_SANS_CODE', staff) });
  });
  if (wrongCode) throw new AppError(400, wrongCode, 'CODE_INCORRECT');
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

// Commande livrée (par le livreur avec le code, ou validée sans code par un agent) : notification à
// l'équipe, pour remercier le client. N'échoue jamais. byAgent : l'agent qui a validé sans code.
export function notifyDelivered(reference, byAgent = null) {
  prisma.order
    .findUnique({
      where: { reference },
      select: { id: true, reference: true, mode: true, courierName: true, statusChanges: { where: { toStatus: 'LIVREE' }, select: { createdAt: true } } },
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
// Première saisie (frais à confirmer, grille vide) ou correction, avec un motif (feeCorrectionError :
// Patron et Opérateur avant le départ du livreur, Patron seulement ensuite)
// nightFee : « dont supplément de nuit » (lot 3, facultatif). Non envoyé : celui de la commande est gardé,
// ramené au nouveau total s'il le dépasse.
export async function setDeliveryFee(reference, amount, staff, reason = null, nightFee = undefined) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    const night = nightFeeAfter(order, amount, nightFee);
    const error = feeCorrectionError(order, staff.role, amount, reason, night.nightFee) || night.error;
    if (error) throw new AppError(order.deliveryFee === amount && !night.error ? 409 : 400, error, 'FRAIS_IMPOSSIBLES');
    await guardedUpdate(tx, order, { deliveryFee: amount, deliveryNightFee: night.nightFee, deliveryFeeSource: 'AGENT' });
    await tx.orderEvent.create({ data: feeEvent(order, amount, staff, reason) });
  });
  return afterChange(reference);
}

// Frais payés par mobile money (code marchand) : l'agent coche après vérification sur le téléphone
// marchand (page Caisse, onglet « Frais à vérifier »). Décocher reste possible (erreur de manipulation).
// Lot 5b : caisse séparée. operator = caisse de la page (RESTAURANT : page Caisse ; PRESTATAIRE : page Livraison).
// Les frais d'une commande Prestataire sont payés sur nos codes : seul notre responsable les vérifie.
export async function markFeeVerified(reference, verified, staff, operator) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    const error = feeOperatorError(order, operator) || feeVerifyError(order, verified);
    if (error) throw new AppError(400, error, 'FRAIS_IMPOSSIBLES');
    await guardedUpdate(tx, order, { deliveryFeeVerifiedAt: verified ? new Date() : null });
    await tx.orderEvent.create({ data: event(order.id, verified ? 'FRAIS_VERIFIES' : 'FRAIS_NON_VERIFIES', staff, { amount: order.deliveryFee }) });
  });
}

export async function setFeeVerified(reference, verified, staff) {
  await markFeeVerified(reference, verified, staff, 'RESTAURANT');
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
