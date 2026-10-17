// Lot 7 : avis des clients (accès à la base). Règles dans review.js.
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { getAppSettings } from './app-settings.service.js';
import { isFeatureOpen } from './features.service.js';
import { periodOrError } from './statement.service.js';
import { pushDeliveryManagers, pushPatrons, pushRoles } from './push.service.js';
import { PATRON_SIMPLE } from './features.js';
import { lowReviewForPatron } from './patron-digest.js';
import { lowReviewNotification } from './push.message.js';
import {
  buildReviews, checkCallBack, checkReviewInput, forDeliveryManager, isReviewToken, lowDeliveryForPartner, newReviewToken,
  reviewRow, reviewState, STATE_ERROR, toPublicReview,
} from './review.js';

const NOT_FOUND = () => new AppError(404, 'Ce lien d’avis n’existe pas. Vérifiez qu’il est complet.', 'AVIS_INTROUVABLE');

// Au passage LIVREE (livrée ou retirée) : la clé du lien, si les avis sont actifs (AVIS ouvert et réglage du
// Patron allumé, getAppSettings). `tx` : la transaction du changement de statut. Rien sinon : ancien message.
export async function reviewTokenData(tx) {
  return (await getAppSettings(tx)).reviewsEnabled ? { reviewToken: newReviewToken() } : {};
}

// Commande trouvée par la clé : seulement ce qu'il faut à la page publique et aux règles
const findByToken = (token, db = prisma) => {
  if (!isReviewToken(token)) return null;
  return db.order.findUnique({
    where: { reviewToken: token },
    select: {
      id: true, reference: true, status: true, mode: true, customerName: true, reviewToken: true,
      review: { select: { id: true } },
      statusChanges: { where: { toStatus: 'LIVREE' }, select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
};

// Page publique : prénom, référence, livraison ou non, et l'état (à donner, déjà donné, fermé, expiré)
export async function getPublicReview(token, now = new Date()) {
  const order = await findByToken(token);
  const state = reviewState(order, { avisOpen: await isFeatureOpen('AVIS'), now });
  if (!state) throw NOT_FOUND();
  return toPublicReview(order, state);
}

// Avis envoyé par le client : un seul par commande (la base le garantit aussi, orderId unique)
export async function submitReview(token, input, now = new Date()) {
  const order = await findByToken(token);
  const state = reviewState(order, { avisOpen: await isFeatureOpen('AVIS'), now });
  if (!state) throw NOT_FOUND();
  if (state !== 'A_DONNER') throw new AppError(STATE_ERROR[state].status, STATE_ERROR[state].message, STATE_ERROR[state].code);
  const { data, error } = checkReviewInput(input, order);
  if (error) throw new AppError(400, error, 'AVIS_INVALIDE');
  let review;
  try {
    review = await prisma.orderReview.create({ data: { orderId: order.id, ...data } });
  } catch (e) {
    if (e.code === 'P2002') throw new AppError(STATE_ERROR.DEJA_DONNE.status, STATE_ERROR.DEJA_DONNE.message, STATE_ERROR.DEJA_DONNE.code);
    throw e;
  }
  if (review.lowRating) alertLowReview(order.id, review);
  return toPublicReview(order, 'DEJA_DONNE');
}

// Mauvais avis : alerte au Patron et au Prestataire ; au Responsable livraison seulement pour une mauvaise note
// de livraison de notre équipe (sans les autres notes). N'échoue jamais.
function alertLowReview(orderId, review) {
  prisma.order
    .findUnique({ where: { id: orderId }, select: { id: true, reference: true, mode: true, deliveryOperator: true, courierName: true } })
    .then(async (order) => {
      if (!order) return;
      // Compte Patron simplifié : le Patron reçoit aussi le commentaire du client ; le Prestataire, comme avant
      if (await isFeatureOpen(PATRON_SIMPLE).catch(() => false)) {
        await pushRoles(order, ['PATRON'], lowReviewForPatron(order, review));
        await pushRoles(order, ['PRESTATAIRE'], lowReviewNotification(order, review));
      } else await pushPatrons(order, lowReviewNotification(order, review));
      if (lowDeliveryForPartner(review, order)) await pushDeliveryManagers(order, lowReviewNotification(order, review, { forPartner: true }));
    })
    .catch((e) => console.error('[push] avis', e));
}

// Avis avec ce qu'il faut de la commande pour les moyennes et la liste (jamais les montants)
const REVIEW_INCLUDE = {
  order: {
    select: {
      reference: true, mode: true, deliveryOperator: true, customerName: true, customerPhone: true, courierId: true, courierName: true,
      // Agent du call center : premier passage à « Payée » (verificationOf, comme les ventes)
      statusChanges: { where: { toStatus: 'PAYEE' }, select: { toStatus: true, staffUserId: true, staffName: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  },
};

// Page Avis du Patron et du Prestataire : la période (date de l'avis) et les mauvais avis pas encore rappelés
export async function getReviews({ du, au }, now = new Date()) {
  const period = periodOrError(du, au, now);
  const [reviews, toCall] = await Promise.all([
    prisma.orderReview.findMany({ where: { createdAt: { gte: period.from, lt: period.end } }, include: REVIEW_INCLUDE, orderBy: { createdAt: 'desc' } }),
    prisma.orderReview.findMany({ where: { lowRating: true, calledBackAt: null }, include: REVIEW_INCLUDE, orderBy: { createdAt: 'asc' }, take: 100 }),
  ]);
  return buildReviews(reviews, period, { toCall });
}

// Responsable livraison (et Prestataire, page Livraison) : la note de livraison de notre équipe seulement.
// La lecture elle-même ne prend que les commandes de notre équipe ; forDeliveryManager ne garde que la note de livraison.
export async function getPartnerReviews({ du, au }, now = new Date()) {
  const period = periodOrError(du, au, now);
  const reviews = await prisma.orderReview.findMany({
    where: { createdAt: { gte: period.from, lt: period.end }, deliveryRating: { not: null }, order: { deliveryOperator: 'PRESTATAIRE', mode: 'LIVRAISON' } },
    select: {
      id: true, deliveryRating: true, createdAt: true,
      order: { select: { reference: true, mode: true, deliveryOperator: true, courierId: true, courierName: true } },
    },
  });
  return forDeliveryManager(reviews, period);
}

// « Client rappelé » : une seule fois, seulement pour un mauvais avis (la base le refuse aussi)
export async function markCalledBack(id, input, staff, now = new Date()) {
  const review = await prisma.orderReview.findUnique({ where: { id: String(id) } });
  if (!review) throw new AppError(404, 'Avis introuvable.', 'AVIS_INTROUVABLE');
  const { data, error } = checkCallBack(input, review, staff, now);
  if (error) throw new AppError(400, error, 'RAPPEL_IMPOSSIBLE');
  const updated = await prisma.orderReview.updateMany({ where: { id: review.id, calledBackAt: null }, data });
  if (updated.count !== 1) throw new AppError(409, 'Quelqu’un vient de noter ce rappel. La page est mise à jour.', 'RAPPEL_DEJA_NOTE');
  return reviewRow(await prisma.orderReview.findUnique({ where: { id: review.id }, include: REVIEW_INCLUDE }));
}

// Détail d'une commande (Patron et Prestataire) : son avis, s'il y en a un
export async function getOrderReview(reference) {
  const review = await prisma.orderReview.findFirst({ where: { order: { reference } }, include: REVIEW_INCLUDE });
  return review ? reviewRow(review) : null;
}
