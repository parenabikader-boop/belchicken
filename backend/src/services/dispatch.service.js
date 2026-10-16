// Lot 5c : tournées, « Commande récupérée » et livreur retiré (règles dans dispatch.js)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { customerAutoEnabled } from '../config/env.js';
import { deliveryError } from './order-status.js';
import { noticeError, noticeState } from './customer-messages.js';
import { generateDeliveryCode } from './courier.js';
import { getFeatures } from './features.service.js';
import { CALL_CENTER_LIGHT, CUSTOMER_TRACKING } from './features.js';
import { quietMode } from './tracking.js';
import { restaurantDispatch } from './courier-team.service.js';
import { courseRemovedNotification } from './push.message.js';
import { pushCourier } from './push.service.js';
import {
  afterChange, assignment, event, findCourier, findForRules, guardedUpdate, notifyCourier, statusChange,
} from './staff-orders.service.js';
import { partnerRunError, partnerUnassignError, pickupError, restaurantTourError } from './dispatch.js';

// Commandes lues dans la transaction, dans l'ordre demandé ; celles introuvables sont omises
async function readOrders(tx, references) {
  const orders = [];
  for (const reference of references) {
    const order = await findForRules(tx, reference).catch((e) => {
      if (e.code === 'COMMANDE_INTROUVABLE') return null;
      throw e;
    });
    if (order) orders.push(order);
  }
  return orders;
}

const newRun = (tx, operator, courier, actor) =>
  tx.deliveryRun.create({ data: { operator, courierId: courier.id, courierName: courier.name, createdById: actor.id, createdByName: actor.name } });

// Prévient les livreurs : nouvelle course pour le nouveau, course retirée pour l'ancien. N'échoue jamais.
function notifyCouriers(changes) {
  for (const { reference, courierId, previousId } of changes) {
    if (courierId) notifyCourier(reference, courierId);
    if (previousId && previousId !== courierId) {
      prisma.order
        .findUnique({ where: { reference }, select: { id: true, reference: true } })
        .then((order) => order && pushCourier(order, previousId, courseRemovedNotification(order)))
        .catch((e) => console.error('[push] course retirée', e));
    }
  }
}

// ─── Mode Prestataire : le Responsable livraison (ou le Prestataire) ───

// Confie une ou plusieurs commandes à un livreur de notre équipe (une tournée), dès « En préparation »
// et jusqu'à la récupération. Une commande déjà confiée à un autre livreur change de livreur.
export async function assignPartnerRun(actor, courierId, references) {
  const changes = [];
  await prisma.$transaction(async (tx) => {
    const orders = await readOrders(tx, references);
    const error = partnerRunError({ orders, references, courierId });
    if (error) throw new AppError(400, error, 'TOURNEE_IMPOSSIBLE');
    let courier = null;
    for (const order of orders) courier = await findCourier(tx, order, courierId); // équipe, compte actif, pas en pause
    const run = await newRun(tx, 'PRESTATAIRE', courier, actor);
    for (const order of orders) {
      await guardedUpdate(tx, order, { ...assignment(courier), deliveryRunId: run.id });
      await tx.orderEvent.create({ data: event(order.id, 'LIVREUR_ASSIGNE', actor, { courierName: courier.name }) });
      changes.push({ reference: order.reference, courierId: courier.id, previousId: order.courierId });
    }
  });
  notifyCouriers(changes);
}

// Retire le livreur d'une commande avant la récupération (elle revient « à attribuer »)
export async function unassignPartner(actor, reference) {
  let previousId = null;
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    const error = partnerUnassignError(order);
    if (error) throw new AppError(400, error, 'LIVREUR_IMPOSSIBLE');
    previousId = order.courierId;
    await guardedUpdate(tx, order, { courierId: null, courierName: null, courierAssignedAt: null, deliveryRunId: null });
    await tx.orderEvent.create({ data: event(order.id, 'LIVREUR_RETIRE', actor, { courierName: order.courierName }) });
  });
  notifyCouriers([{ reference, courierId: null, previousId }]);
}

// « Commande récupérée » : PRETE_LIVRAISON -> EN_LIVRAISON, le code de remise est créé.
// byCourier : le livreur lui-même ; sinon l'agent ou le Responsable livraison, avec un motif
// (noté dans l'historique, événement RECUPEREE_SANS_LIVREUR). Le message « en route » reste à envoyer
// par le call center (ou part tout seul avec l'envoi automatique).
export async function pickUp(actor, reference, { byCourier = false, reason = null } = {}) {
  await prisma.$transaction(async (tx) => {
    const order = await findForRules(tx, reference);
    if (byCourier && order.courierId !== actor.id) throw new AppError(404, 'Course introuvable.', 'COURSE_INTROUVABLE');
    const error = pickupError(order, { byCourier, actorId: actor.id, reason });
    if (error) throw new AppError(400, error, 'RECUPERATION_IMPOSSIBLE');
    await guardedUpdate(tx, order, { status: 'EN_LIVRAISON', deliveryCode: generateDeliveryCode(), deliveryCodeAttempts: 0 });
    await tx.orderStatusChange.create({ data: statusChange(order, 'EN_LIVRAISON', actor, byCourier ? null : reason.trim()) });
    if (!byCourier) await tx.orderEvent.create({ data: event(order.id, 'RECUPEREE_SANS_LIVREUR', actor, { courierName: order.courierName }) });
  });
  // Envoi automatique du message « en route » si allumé ; renvoie la commande pour l'espace équipe
  return afterChange(reference);
}

// ─── Mode Restaurant : l'agent, avec le réglage « Tournées et disponibilité » ───

// Plusieurs commandes « En préparation » partent avec le même livreur. Chacune comme un départ habituel :
// frais saisis, client prévenu de l'étape, son propre code de remise et son message « en route » à envoyer.
// Tout ou rien : une seule commande refusée, aucune ne part. items : [{ reference, from }].
export async function restaurantTour(actor, courierId, items) {
  const references = items.map((i) => i.reference);
  const seen = Object.fromEntries(items.filter((i) => i.from).map((i) => [i.reference, i.from]));
  const changes = [];
  await prisma.$transaction(async (tx) => {
    const orders = await readOrders(tx, references);
    const dispatch = await restaurantDispatch(tx);
    let error = restaurantTourError({ dispatch, orders, seen, references });
    const features = await getFeatures(tx);
    const light = features[CALL_CENTER_LIGHT]; // plan 1 : le départ n'attend plus le message
    const auto = quietMode({ auto: customerAutoEnabled(), trackingOpen: features[CUSTOMER_TRACKING] }); // plan 4
    for (const o of orders) {
      if (error) break;
      const feeError = deliveryError(o);
      const notice = noticeError(noticeState(o, { auto, light }));
      if (feeError || notice) error = `Commande ${o.reference} : ${(feeError || notice).charAt(0).toLowerCase()}${(feeError || notice).slice(1)}`;
    }
    if (error) throw new AppError(400, error, 'TOURNEE_IMPOSSIBLE');
    let courier = null;
    for (const order of orders) courier = await findCourier(tx, order, courierId);
    const run = await newRun(tx, 'RESTAURANT', courier, actor);
    for (const order of orders) {
      await guardedUpdate(tx, order, {
        status: 'EN_LIVRAISON', ...assignment(courier), deliveryRunId: run.id, deliveryCode: generateDeliveryCode(), deliveryCodeAttempts: 0,
      });
      await tx.orderStatusChange.create({ data: statusChange(order, 'EN_LIVRAISON', actor) });
      await tx.orderEvent.create({ data: event(order.id, 'LIVREUR_ASSIGNE', actor, { courierName: courier.name }) });
      changes.push({ reference: order.reference, courierId: courier.id });
    }
  });
  notifyCouriers(changes);
  for (const { reference } of changes) await afterChange(reference); // envoi automatique « en route » si allumé
  return { references };
}
