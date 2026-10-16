// Lot 7 : avis des clients (règles sans base de données, testées dans test/review.test.js ; accès à la base
// dans review.service.js).
//
// - Lien de l'avis : une clé au hasard de 128 bits (22 caractères), créée au passage LIVREE (livrée ou retirée)
//   quand les avis sont actifs (interrupteur AVIS du Prestataire et réglage du Patron « Demander l'avis des
//   clients »). Jamais la référence seule : impossible à deviner. Jamais sur la page de suivi publique.
// - Un seul avis par commande (Order unique dans OrderReview), seulement pour une commande livrée ou retirée,
//   dans les 7 jours qui suivent. Interrupteur AVIS fermé : plus aucun avis reçu, plus de lien dans le message.
// - Trois notes de 1 à 5 : call center, restaurant (la nourriture), livraison (jamais pour une commande à
//   récupérer), et un commentaire facultatif. Une note de 2 ou moins = mauvais avis : alerte et client à rappeler.
// - Moyennes comptées à la date de l'avis. Call center : l'agent qui a vérifié le paiement (verificationOf,
//   comme les ventes). Livraison : le livreur de la commande, avec l'équipe de la commande.
// - Responsable livraison : la note de livraison des commandes de notre équipe seulement, jamais les autres
//   notes, les commentaires, le client ni aucun montant (forDeliveryManager).
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { verificationOf } from './sales.js';
import { DAY } from './statement.js';

export const REVIEW_DAYS = 7;
export const LOW_RATING_MAX = 2;
export const COMMENT_MAX = 500;
export const CRITERIA = ['callCenter', 'food', 'delivery'];
export const CRITERIA_LABEL = { callCenter: 'Call center', food: 'Restaurant', delivery: 'Livraison' };

// ─── Lien de l'avis ───

// 16 octets au hasard -> 22 caractères (A-Z, a-z, 0-9, - et _), utilisables tels quels dans une adresse
export const newReviewToken = () => randomBytes(16).toString('base64url');
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const isReviewToken = (text) => typeof text === 'string' && TOKEN_RE.test(text);

export const reviewUrl = (token, ctx) => `${ctx.siteUrl.replace(/\/+$/, '')}/avis/${token}`;

// Les avis sont-ils actifs ? Inclus par le Prestataire (AVIS) et allumés par le Patron
export const reviewsActive = ({ avisOpen, reviewsEnabled }) => Boolean(avisOpen && reviewsEnabled);

// Heure de la livraison (ou du retrait) : dernier passage à LIVREE
export const deliveredAt = (o) => (o.statusChanges || []).findLast((h) => h.toStatus === 'LIVREE')?.createdAt ?? null;

const expired = (o, now) => {
  const at = deliveredAt(o);
  return !at || now.getTime() > new Date(at).getTime() + REVIEW_DAYS * DAY;
};

// Le lien est-il à mettre dans le message de remerciement ? La commande a sa clé, l'interrupteur AVIS est
// ouvert, et le délai de 7 jours n'est pas passé. Sinon : l'ancien message, sans lien.
// Le réglage du Patron ne compte qu'à la livraison (création de la clé) : un lien déjà créé reste valable.
export function reviewLinkActive(o, { avisOpen, now = new Date() }) {
  return Boolean(o.reviewToken && avisOpen && o.status === 'LIVREE' && !expired(o, now));
}

// État de la page publique pour cette commande (`o` avec statusChanges et review) :
//   null           lien inconnu (même réponse que pour une clé qui n'existe pas) ;
//   'DEJA_DONNE'   un avis existe déjà ;
//   'FERME'        interrupteur AVIS fermé ;
//   'EXPIRE'       plus de 7 jours après la livraison ;
//   'A_DONNER'     le client peut donner son avis.
export function reviewState(o, { avisOpen, now = new Date() }) {
  if (!o || !o.reviewToken || o.status !== 'LIVREE') return null;
  if (o.review) return 'DEJA_DONNE';
  if (!avisOpen) return 'FERME';
  if (expired(o, now)) return 'EXPIRE';
  return 'A_DONNER';
}

export const STATE_ERROR = {
  DEJA_DONNE: { status: 409, code: 'AVIS_DEJA_DONNE', message: 'Vous avez déjà donné votre avis sur cette commande. Merci !' },
  FERME: { status: 403, code: 'AVIS_FERMES', message: 'Les avis ne sont plus recueillis pour le moment. Merci !' },
  EXPIRE: { status: 410, code: 'AVIS_EXPIRE', message: `Ce lien n’est plus valable : les avis se donnent dans les ${REVIEW_DAYS} jours qui suivent la commande.` },
};

// Ce que voit la page publique : le prénom, la référence, et s'il y a une note de livraison. Jamais le
// téléphone, l'adresse ni les montants.
export function toPublicReview(o, state) {
  const first = String(o.customerName || '').trim().split(/\s+/)[0] || '';
  return {
    reference: o.reference,
    firstName: first ? first[0].toLocaleUpperCase('fr') + first.slice(1) : '',
    delivery: o.mode !== 'A_EMPORTER',
    state,
  };
}

// ─── Avis envoyé par le client ───

const stars = (label) =>
  z.number({ required_error: `Donnez une note au ${label}.`, invalid_type_error: `Donnez une note au ${label}.` })
    .int(`Note du ${label} : de 1 à 5 étoiles.`).min(1, `Note du ${label} : de 1 à 5 étoiles.`).max(5, `Note du ${label} : de 1 à 5 étoiles.`);

const reviewSchema = z.object({
  callCenter: stars('call center'),
  food: stars('restaurant'),
  delivery: stars('livreur').nullish(),
  comment: z.string().max(COMMENT_MAX, `Commentaire : ${COMMENT_MAX} caractères au plus.`).nullish(),
}).strict();

// `input` : { callCenter, food, delivery?, comment? } ; `o` : la commande (mode).
// Renvoie { data } (prêt pour OrderReview) ou { error }.
export function checkReviewInput(input, o) {
  const parsed = reviewSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Avis incomplet.' };
  const { callCenter, food, delivery, comment } = parsed.data;
  const pickup = o.mode === 'A_EMPORTER';
  if (pickup && delivery != null) return { error: 'Pas de note de livraison pour une commande à récupérer.' };
  if (!pickup && delivery == null) return { error: 'Donnez une note au livreur.' };
  const text = String(comment ?? '').replace(/\s+/g, ' ').trim();
  const data = {
    callCenterRating: callCenter,
    foodRating: food,
    deliveryRating: pickup ? null : delivery,
    comment: text || null,
  };
  return { data: { ...data, lowRating: isLowRating(data) } };
}

// Mauvais avis : une des notes à 2 étoiles ou moins
export const isLowRating = (r) => [r.callCenterRating, r.foodRating, r.deliveryRating].some((n) => n != null && n <= LOW_RATING_MAX);

// ─── Espace équipe ───

const ratingOf = { callCenter: (r) => r.callCenterRating, food: (r) => r.foodRating, delivery: (r) => r.deliveryRating };

// Moyenne à un chiffre après la virgule (4,3), null sans note
export function average(values) {
  const list = values.filter((v) => v != null);
  return list.length ? Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10 : null;
}

// Nombre d'avis à 1, 2, 3, 4 et 5 étoiles
export function distribution(values) {
  const out = [0, 0, 0, 0, 0];
  for (const v of values) if (v >= 1 && v <= 5) out[v - 1] += 1;
  return out;
}

function summary(reviews, criterion) {
  const values = reviews.map(ratingOf[criterion]).filter((v) => v != null);
  return { count: values.length, average: average(values), distribution: distribution(values) };
}

function groupBy(list, keyOf) {
  const map = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }
  return map;
}
const byAverage = (a, b) => (a.average ?? 0) - (b.average ?? 0) || a.name.localeCompare(b.name, 'fr');

// Agent du call center = celui qui a vérifié le paiement (premier passage à « Payée »)
export function byAgent(reviews) {
  const rows = reviews.map((r) => ({ r, v: verificationOf(r.order) })).filter((x) => x.v);
  return [...groupBy(rows, (x) => x.v.key)].map(([key, list]) => ({
    key,
    name: list.at(-1).v.name,
    ...summary(list.map((x) => x.r), 'callCenter'),
  })).sort(byAverage);
}

// Livreur de la commande (copie figée courierName), avec l'équipe de la commande (lot 5)
export function byCourier(reviews) {
  const rows = reviews.filter((r) => r.deliveryRating != null && (r.order.courierId || r.order.courierName));
  return [...groupBy(rows, (r) => r.order.courierId || `nom:${r.order.courierName}`)].map(([key, list]) => ({
    key,
    name: list.at(-1).order.courierName || 'Compte supprimé',
    team: list.at(-1).order.deliveryOperator || 'RESTAURANT',
    ...summary(list, 'delivery'),
  })).sort(byAverage);
}

// Un avis dans la liste du Patron : notes, commentaire, client (pour le rappeler), agent, livreur
export function reviewRow(r) {
  const v = verificationOf(r.order);
  return {
    id: r.id,
    at: r.createdAt,
    reference: r.order.reference,
    mode: r.order.mode,
    deliveryOperator: r.order.deliveryOperator || 'RESTAURANT',
    customerName: r.order.customerName,
    customerPhone: r.order.customerPhone,
    callCenter: r.callCenterRating,
    food: r.foodRating,
    delivery: r.deliveryRating,
    comment: r.comment,
    lowRating: r.lowRating,
    agentName: v?.name ?? null,
    courierName: r.order.mode === 'A_EMPORTER' ? null : r.order.courierName ?? null,
    calledBack: r.calledBackAt ? { at: r.calledBackAt, by: r.calledBackByName, note: r.calledBackNote } : null,
  };
}

// Page Avis du Patron et du Prestataire. `reviews` : avis de la période (createdAt), avec leur commande
// (reference, mode, deliveryOperator, customerName, customerPhone, courierId, courierName, statusChanges PAYEE).
// `toCall` : mauvais avis pas encore rappelés, toutes dates confondues.
export function buildReviews(reviews, period, { toCall = [] } = {}) {
  const sorted = [...reviews].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return {
    period: { du: period.from.toISOString().slice(0, 10), au: period.to.toISOString().slice(0, 10) },
    count: reviews.length,
    lowCount: reviews.filter((r) => r.lowRating).length,
    criteria: Object.fromEntries(CRITERIA.map((c) => [c, summary(reviews, c)])),
    byAgent: byAgent(reviews),
    byCourier: byCourier(reviews),
    toCall: [...toCall].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(reviewRow),
    list: sorted.map(reviewRow),
  };
}

// Responsable livraison : la note de livraison des commandes de notre équipe (mode Prestataire) seulement.
// Champs choisis un par un : jamais les notes du call center ni de la nourriture, ni le commentaire, ni le
// client, ni l'agent, ni aucun montant (test/review.test.js).
export function forDeliveryManager(reviews, period) {
  const ours = reviews.filter((r) => r.order.deliveryOperator === 'PRESTATAIRE' && r.order.mode !== 'A_EMPORTER' && r.deliveryRating != null);
  const delivery = summary(ours, 'delivery');
  return {
    period: { du: period.from.toISOString().slice(0, 10), au: period.to.toISOString().slice(0, 10) },
    count: delivery.count,
    average: delivery.average,
    distribution: delivery.distribution,
    lowCount: ours.filter((r) => r.deliveryRating <= LOW_RATING_MAX).length,
    byCourier: byCourier(ours).map(({ key, name, count, average: avg, distribution: d }) => ({ key, name, count, average: avg, distribution: d })),
    list: [...ours]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => ({ id: r.id, at: r.createdAt, reference: r.order.reference, courierName: r.order.courierName ?? null, delivery: r.deliveryRating })),
  };
}

// Mauvaise note de livraison de notre équipe : alerte aussi au Responsable livraison (sans les autres notes)
export const lowDeliveryForPartner = (r, order) =>
  order.deliveryOperator === 'PRESTATAIRE' && order.mode !== 'A_EMPORTER' && r.deliveryRating != null && r.deliveryRating <= LOW_RATING_MAX;

// « Client rappelé » : note facultative, 300 caractères au plus. Renvoie { data } ou { error }.
export function checkCallBack(input, review, staff, now = new Date()) {
  if (!review.lowRating) return { error: 'Cet avis n’est pas un mauvais avis : rien à rappeler.' };
  if (review.calledBackAt) return { error: `Client déjà rappelé par ${review.calledBackByName || 'un membre de l’équipe'}.` };
  const note = String(input?.note ?? '').replace(/\s+/g, ' ').trim();
  if (note.length > 300) return { error: 'Note : 300 caractères au plus.' };
  return { data: { calledBackAt: now, calledBackById: staff.id, calledBackByName: staff.name, calledBackNote: note || null } };
}
