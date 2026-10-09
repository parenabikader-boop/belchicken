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
import { formatFcfa } from '../utils/format.js';
import { paymentCodes } from './payment-codes.js';
import { clean, itemsText } from './whatsapp.message.js';

// Phrase des frais de livraison, la même dans les messages et sur la page de suivi. Les frais sont
// payés au livreur à la réception, en espèces ou par mobile money avec le code marchand de l'opérateur
// (montant des frais déjà rempli). Nom du compte et codes sont des variables : modifiables sur Render
// sans faire réapprouver les modèles Meta. Chaque code sur sa ligne, entre ``` : sinon WhatsApp prend
// les * pour du gras et les fait disparaître. Les retours à la ligne sont dans le modèle, jamais dans
// les valeurs (refusés par Meta).
const feeLine = (fee, merchant, orange, moov, telecel) =>
  `Frais de livraison : ${fee}, à payer au livreur à la réception, en espèces ou par mobile money avec le code marchand ` +
  `(sans frais, nom affiché : ${merchant}) :\n` +
  `Orange Money : \`\`\`${orange}\`\`\`\n` +
  `Moov Money : \`\`\`${moov}\`\`\`\n` +
  `Telecel Money : \`\`\`${telecel}\`\`\``;
// Nom du compte marchand, puis les 3 codes avec le montant des frais
const feeCodes = (o, ctx) => {
  const { merchantName, operators } = paymentCodes(ctx.payment, o.deliveryFee ?? 0);
  return [merchantName, ...operators.map((op) => op.code)];
};
// Livraison offerte (0 F, grille du Patron) : rien à payer au livreur, pas de codes marchands.
// Chaque message avec des frais a sa version « offerte » (modèle Meta à part, même étape).
const FREE_LINE = 'Livraison offerte : vous n’avez rien à payer au livreur.';
// Paiement des plats d'une commande saisie par l'agent : le total, puis un code par ligne (montant rempli)
const payLine = (total, merchant, orange, moov, telecel) =>
  `Total à payer : ${total}, par mobile money avec le code marchand (sans frais, nom affiché : ${merchant}) :\n` +
  `Orange Money : \`\`\`${orange}\`\`\`\n` +
  `Moov Money : \`\`\`${moov}\`\`\`\n` +
  `Telecel Money : \`\`\`${telecel}\`\`\``;
const payCodes = (o, ctx) => {
  const { merchantName, operators } = paymentCodes(ctx.payment, o.itemsTotal);
  return [merchantName, ...operators.map((op) => op.code)];
};
export const feeSentence = (o, ctx) => (o.deliveryFee === 0 ? FREE_LINE : feeLine(formatFcfa(o.deliveryFee), ...feeCodes(o, ctx)));

export const MESSAGES = {
  PAIEMENT_CONFIRME: {
    template: 'commande_paiement_confirme',
    label: 'Paiement confirmé et frais de livraison',
    body:
      'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande {{2}}. Merci !\n\n' +
      feeLine('{{4}}', '{{5}}', '{{6}}', '{{7}}', '{{8}}') + '\n\n' +
      'Suivez votre commande ici : {{9}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), formatFcfa(o.deliveryFee), ...feeCodes(o, ctx), trackingUrl(o, ctx)],
    free: {
      template: 'commande_paiement_confirme_offerte',
      body:
        'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande {{2}}. Merci !\n\n' +
        FREE_LINE + '\n\nSuivez votre commande ici : {{4}}\n\nBelchicken Burkina',
      params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), trackingUrl(o, ctx)],
    },
  },
  EN_PREPARATION: {
    template: 'commande_en_preparation',
    label: 'Commande en préparation',
    body:
      'Bonjour {{1}}, votre commande {{2}} est en préparation.\n\n' +
      feeLine('{{3}}', '{{4}}', '{{5}}', '{{6}}', '{{7}}') + '\n\n' +
      'Suivez votre commande ici : {{8}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.deliveryFee), ...feeCodes(o, ctx), trackingUrl(o, ctx)],
    free: {
      template: 'commande_en_preparation_offerte',
      body:
        'Bonjour {{1}}, votre commande {{2}} est en préparation.\n\n' +
        FREE_LINE + '\n\nSuivez votre commande ici : {{3}}\n\nBelchicken Burkina',
      params: (o, ctx) => [firstName(o.customerName), o.reference, trackingUrl(o, ctx)],
    },
  },
  EN_ROUTE: {
    template: 'commande_en_route',
    label: 'Commande en route',
    body:
      'Bonjour {{1}}, votre commande {{2}} est en route ! Le livreur arrive bientôt : gardez votre téléphone près de vous.\n\n' +
      'Donnez ce code au livreur à la réception : {{3}}. Ne le donnez qu’au livreur, quand il vous remet la commande.\n\n' +
      feeLine('{{4}}', '{{5}}', '{{6}}', '{{7}}', '{{8}}') + '\n\n' +
      'Suivez votre commande ici : {{9}}\n\nBelchicken Burkina',
    // Code de remise à 4 chiffres (courier.js), créé au passage EN_LIVRAISON
    params: (o, ctx) => [firstName(o.customerName), o.reference, o.deliveryCode || '-', formatFcfa(o.deliveryFee), ...feeCodes(o, ctx), trackingUrl(o, ctx)],
    free: {
      template: 'commande_en_route_offerte',
      body:
        'Bonjour {{1}}, votre commande {{2}} est en route ! Le livreur arrive bientôt : gardez votre téléphone près de vous.\n\n' +
        'Donnez ce code au livreur à la réception : {{3}}. Ne le donnez qu’au livreur, quand il vous remet la commande.\n\n' +
        FREE_LINE + '\n\nSuivez votre commande ici : {{4}}\n\nBelchicken Burkina',
      params: (o, ctx) => [firstName(o.customerName), o.reference, o.deliveryCode || '-', trackingUrl(o, ctx)],
    },
  },
  // ─── Commande saisie par un agent (lot 2, appel ou WhatsApp) : récapitulatif et codes marchands avec le total ───
  // Pas obligatoire : au téléphone, l'agent donne souvent le code de vive voix.
  COMMANDE_A_PAYER: {
    template: 'commande_a_payer',
    label: 'Commande enregistrée, à payer',
    body:
      'Bonjour {{1}}, merci pour votre commande {{2}} : {{3}}.\n\n' +
      payLine('{{4}}', '{{5}}', '{{6}}', '{{7}}', '{{8}}') + '\n\n' +
      'Payez de préférence depuis le {{9}} : c’est le numéro que nous vérifions. Votre commande est préparée dès que le paiement est vérifié. ' +
      'Les frais de livraison se paient au livreur à la réception : nous vous les confirmons avec le paiement.\n\n' +
      'Suivez votre commande ici : {{10}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, itemsText(o.items || []), formatFcfa(o.itemsTotal), ...payCodes(o, ctx), formatPhone(o.paymentPayerPhone), trackingUrl(o, ctx)],
  },
  COMMANDE_A_PAYER_EMPORTER: {
    template: 'emporter_commande_a_payer',
    label: 'Commande enregistrée, à payer (à emporter)',
    body:
      'Bonjour {{1}}, merci pour votre commande à emporter {{2}} : {{3}}.\n\n' +
      payLine('{{4}}', '{{5}}', '{{6}}', '{{7}}', '{{8}}') + '\n\n' +
      'Payez de préférence depuis le {{9}} : c’est le numéro que nous vérifions. Votre commande est préparée dès que le paiement est vérifié, ' +
      'puis nous vous écrivons quand elle est prête à retirer au restaurant.\n\n' +
      'Suivez votre commande ici : {{10}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, itemsText(o.items || []), formatFcfa(o.itemsTotal), ...payCodes(o, ctx), formatPhone(o.paymentPayerPhone), trackingUrl(o, ctx)],
  },
  // ─── Parcours court (réglage AppSettings.shortFlow) : paiement vérifié et préparation lancée en une fois ───
  PAIEMENT_PREPARATION: {
    template: 'commande_paiement_preparation',
    label: 'Paiement confirmé, commande en préparation',
    body:
      'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande {{2}}. Merci ! Votre commande est en préparation.\n\n' +
      feeLine('{{4}}', '{{5}}', '{{6}}', '{{7}}', '{{8}}') + '\n\n' +
      'Suivez votre commande ici : {{9}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), formatFcfa(o.deliveryFee), ...feeCodes(o, ctx), trackingUrl(o, ctx)],
    free: {
      template: 'commande_paiement_preparation_offerte',
      body:
        'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande {{2}}. Merci ! Votre commande est en préparation.\n\n' +
        FREE_LINE + '\n\nSuivez votre commande ici : {{4}}\n\nBelchicken Burkina',
      params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), trackingUrl(o, ctx)],
    },
  },
  PAIEMENT_PREPARATION_EMPORTER: {
    template: 'emporter_paiement_preparation',
    label: 'Paiement confirmé, commande en préparation (à emporter)',
    body:
      'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande à emporter {{2}}. Merci ! Votre commande est en préparation : ' +
      'nous vous écrivons dès qu’elle est prête à retirer au restaurant.\n\n' +
      'Suivez votre commande ici : {{4}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), trackingUrl(o, ctx)],
  },
  LIVREE: {
    template: 'commande_livree',
    label: 'Commande livrée, remerciement',
    body: 'Bonjour {{1}}, votre commande {{2}} a été livrée. Merci de votre confiance et bon appétit ! À bientôt chez Belchicken Burkina.',
    params: (o) => [firstName(o.customerName), o.reference],
  },
  // ─── À emporter : pas de frais de livraison, le client vient au restaurant ───
  PAIEMENT_CONFIRME_EMPORTER: {
    template: 'emporter_paiement_confirme',
    label: 'Paiement confirmé (à emporter)',
    body:
      'Bonjour {{1}}, nous avons bien reçu votre paiement de {{3}} pour la commande à emporter {{2}}. Merci !\n\n' +
      'Nous vous écrivons dès qu’elle est prête à retirer au restaurant.\n\n' +
      'Suivez votre commande ici : {{4}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, formatFcfa(o.itemsTotal), trackingUrl(o, ctx)],
  },
  EN_PREPARATION_EMPORTER: {
    template: 'emporter_en_preparation',
    label: 'Commande en préparation (à emporter)',
    body:
      'Bonjour {{1}}, votre commande à emporter {{2}} est en préparation. Nous vous écrivons dès qu’elle est prête.\n\n' +
      'Suivez votre commande ici : {{3}}\n\nBelchicken Burkina',
    params: (o, ctx) => [firstName(o.customerName), o.reference, trackingUrl(o, ctx)],
  },
  COMMANDE_PRETE: {
    template: 'emporter_commande_prete',
    label: 'Commande prête à retirer',
    body:
      'Bonjour {{1}}, votre commande {{2}} est prête ! Vous pouvez venir la retirer au restaurant.\n\n' +
      'Au comptoir, donnez ce code : {{3}}. Ne le donnez qu’au comptoir, quand on vous remet la commande.\n\n' +
      'Adresse : {{4}}\nItinéraire : {{5}}\n\nBelchicken Burkina',
    // Code de retrait à 4 chiffres (courier.js), créé au passage PRETE
    params: (o, ctx) => [firstName(o.customerName), o.reference, o.deliveryCode || '-', ctx.restaurantAddress, ctx.restaurantMapsUrl],
  },
  RETIREE: {
    template: 'emporter_commande_retiree',
    label: 'Commande retirée, remerciement',
    body: 'Bonjour {{1}}, vous avez retiré votre commande {{2}}. Merci de votre confiance et bon appétit ! À bientôt chez Belchicken Burkina.',
    params: (o) => [firstName(o.customerName), o.reference],
  },
  ANNULEE: {
    template: 'commande_annulee',
    label: 'Commande annulée, avec le motif',
    body:
      'Bonjour {{1}}, votre commande {{2}} a été annulée.\nMotif : {{3}}.\n\n' +
      'Pour toute question, répondez simplement à ce message.\n\nBelchicken Burkina',
    params: (o) => [firstName(o.customerName), o.reference, (o.cancelReason || 'non précisé').trim().replace(/[\s.!]+$/, '')],
  },
};

export const MESSAGE_KEYS = Object.keys(MESSAGES);

// Message de l'ancien fonctionnement (frais payés avant le départ, jusqu'au 5 octobre 2026) : gardé pour
// l'historique, et sa confirmation compte comme celle du message « en préparation » qui le remplace
const OLD_LABELS = { FRAIS_RECUS: 'Frais reçus, commande en préparation' };
const SAME_AS = { EN_PREPARATION: ['EN_PREPARATION', 'FRAIS_RECUS'] };
const sameMessage = (logged, key) => (SAME_AS[key] || [key]).includes(logged);
export const messageLabel = (key) => MESSAGES[key]?.label || OLD_LABELS[key] || key;

// « awa traoré » -> « Awa » : le prénom tel que le client l'a tapé, première lettre en majuscule
export function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first ? first[0].toLocaleUpperCase('fr') + first.slice(1) : 'cher client';
}

// +22676123456 -> « +226 76 12 34 56 »
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
  if (o.mode === 'A_EMPORTER') return pickupMessageKey(o);
  const feeSet = o.deliveryFee != null;
  switch (o.status) {
    case 'PAYEE':
    case 'EN_PREPARATION': {
      // Parcours court : la commande est passée directement en préparation, un seul message pour les deux étapes
      const key = o.status === 'PAYEE' ? 'PAIEMENT_CONFIRME' : o.shortFlow ? 'PAIEMENT_PREPARATION' : 'EN_PREPARATION';
      return feeSet ? { key } : { key, missing: 'Saisissez d’abord les frais de livraison.' };
    }
    case 'EN_LIVRAISON':
      return { key: 'EN_ROUTE' };
    case 'LIVREE':
      return { key: 'LIVREE' };
    case 'ANNULEE':
      return { key: 'ANNULEE' };
    case 'PAIEMENT_A_VERIFIER':
      return toPay(o);
    default:
      return null;
  }
}

// Paiement à vérifier : on ne promet rien au client. Sauf pour une commande saisie par un agent : le
// récapitulatif avec les codes marchands, que l'agent peut envoyer (optional : jamais obligatoire).
const toPay = (o) => (o.createdById ? { key: o.mode === 'A_EMPORTER' ? 'COMMANDE_A_PAYER_EMPORTER' : 'COMMANDE_A_PAYER', optional: true } : null);

// À emporter : pas de frais à attendre, le message « prête » donne l'adresse du restaurant
const PICKUP_KEYS = {
  PAYEE: 'PAIEMENT_CONFIRME_EMPORTER',
  EN_PREPARATION: 'EN_PREPARATION_EMPORTER',
  PRETE: 'COMMANDE_PRETE',
  LIVREE: 'RETIREE',
  ANNULEE: 'ANNULEE',
};
function pickupMessageKey(o) {
  if (o.status === 'PAIEMENT_A_VERIFIER') return toPay(o);
  if (o.shortFlow && o.status === 'EN_PREPARATION') return { key: 'PAIEMENT_PREPARATION_EMPORTER' };
  const key = PICKUP_KEYS[o.status];
  return key ? { key } : null;
}

// Messages de remerciement (après LIVREE) : livraison ou retrait au comptoir
export const THANKS_KEYS = ['LIVREE', 'RETIREE'];

// Modèle du message pour cette commande : la version « livraison offerte » quand les frais sont de 0 F
export const messageModel = (key, o) => (o.deliveryFee === 0 && MESSAGES[key].free) || MESSAGES[key];

// Valeurs des variables {{1}}, {{2}}… pour cette commande, nettoyées pour Meta
export const messageParams = (key, o, ctx) => messageModel(key, o).params(o, ctx).map((p) => clean(p));

// Texte final : le modèle rempli avec les valeurs
export const renderMessage = (key, o, ctx) => {
  const params = messageParams(key, o, ctx);
  return messageModel(key, o).body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1]);
};

// Lien qui ouvre WhatsApp sur la conversation avec le client, message déjà écrit
export const whatsappLink = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

// Ce que l'espace équipe affiche : le message de l'étape, prêt à ouvrir dans WhatsApp
export function customerMessage(o, ctx) {
  const current = currentMessageKey(o);
  if (!current) return null;
  const { key, missing, optional } = current;
  const base = { key, label: MESSAGES[key].label, ...(optional && { optional: true }) };
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
    // Frais saisis ou corrigés : nouveau montant, nouveau message
    case 'PAIEMENT_CONFIRME':
      return Math.max(lastStatusAt(o, 'PAYEE'), lastEventAt(o, 'FRAIS_SAISIS'), lastEventAt(o, 'FRAIS_CORRIGES'));
    case 'EN_PREPARATION':
    case 'PAIEMENT_PREPARATION':
      return Math.max(lastStatusAt(o, 'EN_PREPARATION'), lastEventAt(o, 'FRAIS_SAISIS'), lastEventAt(o, 'FRAIS_CORRIGES'));
    case 'EN_ROUTE':
      return Math.max(lastStatusAt(o, 'EN_LIVRAISON'), lastEventAt(o, 'FRAIS_CORRIGES'));
    case 'PAIEMENT_CONFIRME_EMPORTER':
      return lastStatusAt(o, 'PAYEE');
    case 'EN_PREPARATION_EMPORTER':
    case 'PAIEMENT_PREPARATION_EMPORTER':
      return lastStatusAt(o, 'EN_PREPARATION');
    case 'COMMANDE_PRETE':
      return lastStatusAt(o, 'PRETE');
    case 'COMMANDE_A_PAYER':
    case 'COMMANDE_A_PAYER_EMPORTER':
      return lastStatusAt(o, 'PAIEMENT_A_VERIFIER');
    case 'RETIREE':
      return lastStatusAt(o, 'LIVREE');
    default:
      return lastStatusAt(o, key); // LIVREE, ANNULEE
  }
}

// Où en est le message de l'étape :
//   null si rien à dire au client (paiement à vérifier) ;
//   sinon { key, missing?, confirmed (dernier événement de confirmation ou null), required }.
//   required = l'étape suivante est bloquée tant que l'envoi n'est pas confirmé (jamais pour un message
//   optional : « commande à payer » d'une commande saisie par un agent).
// `o` : la commande avec statusChanges et events (createdAt).
export function noticeState(o, { auto = false } = {}) {
  const current = currentMessageKey(o);
  if (!current) return null;
  const since = stepStart(o, current.key);
  const confirmed =
    (o.events || []).findLast((e) => CONFIRM_TYPES.includes(e.type) && sameMessage(e.messageKey, current.key) && time(e.createdAt) >= since) || null;
  return { ...current, confirmed, required: !auto && !confirmed && !current.optional };
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
  if (stepStart(o, 'LIVREE') < THANKS_SINCE.getTime()) return false; // même début pour RETIREE
  return Boolean(noticeState(o, { auto })?.required);
}

// Même règle, en filtre Prisma (liste et compteurs de la page Commandes). null = aucune commande.
// Un remerciement confirmé ne peut exister qu'une fois la commande livrée (LIVREE est la dernière étape).
export function thanksWhere({ auto = false } = {}) {
  if (auto) return null;
  return {
    status: 'LIVREE',
    statusChanges: { some: { toStatus: 'LIVREE', createdAt: { gte: THANKS_SINCE } } },
    events: { none: { type: { in: CONFIRM_TYPES }, messageKey: { in: THANKS_KEYS } } },
  };
}
