// Messages WhatsApp au client, à chaque étape de sa commande (sans base de données,
// testés dans test/customer-messages.test.js).
//
// Chaque message est écrit UNE fois, au format des modèles WhatsApp de Meta : un texte avec
// des variables {{1}}, {{2}}… et la liste de leurs valeurs pour une commande.
//   - Aujourd'hui : le texte rempli ouvre WhatsApp sur le téléphone de l'agent (lien wa.me).
//   - Plus tard : le même modèle, approuvé chez Meta sous le nom `template`, part tout seul par
//     l'API (sendCustomerMessage dans whatsapp.service.js) avec les mêmes valeurs.
// Règles Meta respectées : pas de variable au tout début ni à la toute fin du texte, et des valeurs
// sans retour à la ligne (voir clean() dans whatsapp.message.js).
import { formatFcfa, PAYMENT_LABELS } from '../utils/format.js';
import { clean } from './whatsapp.message.js';

export const MESSAGES = {
  PAIEMENT_CONFIRME: {
    template: 'commande_paiement_confirme',
    label: 'Paiement confirmé et frais de livraison',
    body:
      'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande {{2}}. Merci !\n\n' +
      'Frais de livraison pour votre quartier : {{4}}. Merci de les envoyer par {{5}} au {{6}}. ' +
      'Le livreur part dès leur réception.\n\n' +
      'Suivez votre commande ici : {{7}}\n\nBelchicken',
    params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), formatFcfa(o.deliveryFee), PAYMENT_LABELS[o.paymentMethod] || 'Orange Money ou Moov Money', formatPhone(ctx.merchantNumber), trackingUrl(o, ctx)],
  },
  FRAIS_RECUS: {
    template: 'commande_en_preparation',
    label: 'Frais reçus, commande en préparation',
    body:
      'Bonjour {{1}}, nous avons bien reçu vos frais de livraison de {{2}}. Votre commande {{3}} est en préparation.\n\n' +
      'Suivez votre commande ici : {{4}}\n\nBelchicken',
    params: (o, ctx) => [firstName(o.customerName), formatFcfa(o.deliveryFee), o.reference, trackingUrl(o, ctx)],
  },
  EN_ROUTE: {
    template: 'commande_en_route',
    label: 'Commande en route',
    body:
      'Bonjour {{1}}, votre commande {{2}} est en route ! Le livreur arrive bientôt : gardez votre téléphone près de vous.\n\n' +
      'Donnez ce code au livreur à la réception : {{3}}. Ne le donnez qu’au livreur, quand il vous remet la commande.\n\n' +
      'Suivez votre commande ici : {{4}}\n\nBelchicken',
    // Code de remise à 4 chiffres (courier.js), créé au passage EN_LIVRAISON
    params: (o, ctx) => [firstName(o.customerName), o.reference, o.deliveryCode || '-', trackingUrl(o, ctx)],
  },
  LIVREE: {
    template: 'commande_livree',
    label: 'Commande livrée, remerciement',
    body: 'Bonjour {{1}}, votre commande {{2}} a été livrée. Merci de votre confiance et bon appétit ! À bientôt chez Belchicken.',
    params: (o) => [firstName(o.customerName), o.reference],
  },
  ANNULEE: {
    template: 'commande_annulee',
    label: 'Commande annulée, avec le motif',
    body:
      'Bonjour {{1}}, votre commande {{2}} a été annulée.\nMotif : {{3}}.\n\n' +
      'Pour toute question, répondez simplement à ce message.\n\nBelchicken',
    params: (o) => [firstName(o.customerName), o.reference, (o.cancelReason || 'non précisé').trim().replace(/[\s.!]+$/, '')],
  },
};

export const MESSAGE_KEYS = Object.keys(MESSAGES);

// « awa traoré » -> « Awa » : le prénom tel que le client l'a tapé, première lettre en majuscule
export function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first ? first[0].toLocaleUpperCase('fr') + first.slice(1) : 'cher client';
}

// +22670000000 -> « +226 70 00 00 00 »
export function formatPhone(phone) {
  const m = /^\+?226(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(phone || '').replace(/\s/g, ''));
  return m ? `+226 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : String(phone || '');
}

export const trackingUrl = (o, ctx) => `${ctx.siteUrl.replace(/\/+$/, '')}/suivi/${o.reference}`;

// Le message qui correspond à l'étape où en est la commande (au plus un à la fois) :
//   { key }                si on peut l'envoyer ;
//   { key, missing }       s'il manque quelque chose (le bouton est grisé avec cette explication) ;
//   null                   s'il n'y a rien à dire au client à cette étape.
export function currentMessageKey(o) {
  const feeSet = o.deliveryFee != null;
  const feeReceived = feeSet && o.deliveryFeeReceivedAt != null;
  switch (o.status) {
    case 'PAYEE':
    case 'EN_PREPARATION':
      if (!feeSet) return { key: 'PAIEMENT_CONFIRME', missing: 'Saisissez d’abord les frais de livraison.' };
      return { key: feeReceived ? 'FRAIS_RECUS' : 'PAIEMENT_CONFIRME' };
    case 'EN_LIVRAISON':
      return { key: 'EN_ROUTE' };
    case 'LIVREE':
      return { key: 'LIVREE' };
    case 'ANNULEE':
      return { key: 'ANNULEE' };
    default:
      return null; // paiement à vérifier : on ne promet rien au client
  }
}

// Valeurs des variables {{1}}, {{2}}… pour cette commande, nettoyées pour Meta
export const messageParams = (key, o, ctx) => MESSAGES[key].params(o, ctx).map((p) => clean(p));

// Texte final : le modèle rempli avec les valeurs
export const renderMessage = (key, o, ctx) => {
  const params = messageParams(key, o, ctx);
  return MESSAGES[key].body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1]);
};

// Lien qui ouvre WhatsApp sur la conversation avec le client, message déjà écrit
export const whatsappLink = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

// Ce que l'espace équipe affiche : le message de l'étape, prêt à ouvrir dans WhatsApp
export function customerMessage(o, ctx) {
  const current = currentMessageKey(o);
  if (!current) return null;
  const { key, missing } = current;
  const base = { key, label: MESSAGES[key].label };
  if (missing) return { ...base, missing };
  const text = renderMessage(key, o, ctx);
  return { ...base, text, url: whatsappLink(o.customerPhone, text) };
}

// ─────────── Client prévenu à chaque étape ───────────
// Chaque étape a son message (currentMessageKey). Tant que l'agent n'a pas confirmé l'avoir envoyé
// (« Oui, envoyé » ou « Client prévenu par appel »), l'étape suivante est refusée par l'API.
// La confirmation compte seulement si elle date d'après le début de l'étape : une nouvelle étape,
// ou un nouveau montant de frais, demande un nouveau message.
// Avec l'envoi automatique (WHATSAPP_CUSTOMER_AUTO=1), rien n'est demandé : le message part tout seul.
export const CONFIRM_TYPES = ['MESSAGE_ENVOYE', 'CLIENT_APPELE'];

const time = (d) => (d ? new Date(d).getTime() : 0);
const lastStatusAt = (o, status) => time((o.statusChanges || []).findLast((h) => h.toStatus === status)?.createdAt);
const lastEventAt = (o, type) => time((o.events || []).findLast((e) => e.type === type)?.createdAt);

// Début de l'étape dont le message est `key` (millisecondes)
export function stepStart(o, key) {
  switch (key) {
    case 'PAIEMENT_CONFIRME':
      return Math.max(lastStatusAt(o, 'PAYEE'), lastEventAt(o, 'FRAIS_SAISIS'));
    case 'FRAIS_RECUS':
      return lastEventAt(o, 'FRAIS_RECUS') || lastStatusAt(o, 'EN_PREPARATION');
    case 'EN_ROUTE':
      return lastStatusAt(o, 'EN_LIVRAISON');
    default:
      return lastStatusAt(o, key); // LIVREE, ANNULEE
  }
}

// Où en est le message de l'étape :
//   null si rien à dire au client (paiement à vérifier) ;
//   sinon { key, missing?, confirmed (dernier événement de confirmation ou null), required }.
//   required = l'étape suivante est bloquée tant que l'envoi n'est pas confirmé.
// `o` : la commande avec statusChanges et events (createdAt).
export function noticeState(o, { auto = false } = {}) {
  const current = currentMessageKey(o);
  if (!current) return null;
  const since = stepStart(o, current.key);
  const confirmed =
    (o.events || []).findLast((e) => CONFIRM_TYPES.includes(e.type) && e.messageKey === current.key && time(e.createdAt) >= since) || null;
  return { ...current, confirmed, required: !auto && !confirmed };
}

// Avant de passer à l'étape suivante : null si permis, sinon le message
export function noticeError(state) {
  if (!state || !state.required) return null;
  if (state.missing) return state.missing;
  return `Prévenez d’abord le client (« ${MESSAGES[state.key].label} »), puis confirmez l’envoi.`;
}

// ─────────── Livrées · à remercier ───────────
// Une commande livrée reste dans l'étape « à remercier » tant que l'agent n'a pas confirmé le message
// de remerciement (LIVREE). Avec l'envoi automatique, il part tout seul : elle va directement dans l'historique.
// Seules les livraisons à partir de THANKS_SINCE comptent : les anciennes, d'avant cette étape, restent dans l'historique.
export const THANKS_SINCE = new Date('2026-10-05T00:00:00Z');

// `o` : la commande avec statusChanges et events (createdAt)
export function needsThanks(o, { auto = false } = {}) {
  if (auto || o.status !== 'LIVREE') return false;
  if (stepStart(o, 'LIVREE') < THANKS_SINCE.getTime()) return false;
  return Boolean(noticeState(o, { auto })?.required);
}

// Même règle, en filtre Prisma (liste et compteurs de la page Commandes). null = aucune commande.
// Un remerciement confirmé ne peut exister qu'une fois la commande livrée (LIVREE est la dernière étape).
export function thanksWhere({ auto = false } = {}) {
  if (auto) return null;
  return {
    status: 'LIVREE',
    statusChanges: { some: { toStatus: 'LIVREE', createdAt: { gte: THANKS_SINCE } } },
    events: { none: { type: { in: CONFIRM_TYPES }, messageKey: 'LIVREE' } },
  };
}
