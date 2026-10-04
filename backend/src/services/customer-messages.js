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
      'Suivez votre commande ici : {{3}}\n\nBelchicken',
    params: (o, ctx) => [firstName(o.customerName), o.reference, trackingUrl(o, ctx)],
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
      if (!feeReceived) return { key: 'PAIEMENT_CONFIRME' };
      if (o.status === 'PAYEE') return { key: 'FRAIS_RECUS', missing: 'Commencez la préparation pour prévenir le client.' };
      return { key: 'FRAIS_RECUS' };
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
