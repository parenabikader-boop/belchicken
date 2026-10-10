// Lot 5 : livraison en deux modes, réglés par le Prestataire (sans base de données, testé dans
// test/delivery-mode.test.js). Les accès à la base sont dans delivery-mode.service.js.
//
// - RESTAURANT (par défaut, pas de ligne DeliveryCompany) : fonctionnement d'avant le lot 5. Les frais de
//   livraison sont payés sur les codes marchands ECOFOOD (env.payment).
// - PRESTATAIRE : notre équipe de livreurs. Les frais sont payés sur NOS codes marchands, avec notre nom.
//   Le mode ne s'active qu'avec notre société, notre nom affiché et nos 3 codes valides.
// - Le mode est noté sur chaque commande à sa création (Order.deliveryOperator) : changer de mode ne
//   touche pas les commandes déjà passées.
// - Le paiement des plats reste toujours sur les codes ECOFOOD, dans les deux modes.
// Plusieurs restaurants plus tard : rien ici ne dépend du menu ni des prix des plats.
import { isValidCodeTemplate, MOBILE_MONEY_METHODS } from './payment-codes.js';
import { PAYMENT_LABELS } from '../utils/format.js';

export const OPERATORS = ['RESTAURANT', 'PRESTATAIRE'];
export const OPERATOR_LABEL = { RESTAURANT: 'Restaurant', PRESTATAIRE: 'Prestataire' };

// Colonne de DeliveryCompany pour chaque opérateur mobile money
export const CODE_FIELDS = { ORANGE_MONEY: 'orangeCode', MOOV_MONEY: 'moovCode', TELECEL_MONEY: 'telecelCode' };
const TEXT_FIELDS = { companyName: 'Société', merchantName: 'Nom affiché' };

export const NAME_MAX = 80;

// Pas de ligne en base : mode Restaurant, rien de rempli
export const DEFAULT_COMPANY = {
  mode: 'RESTAURANT', companyName: null, merchantName: null, orangeCode: null, moovCode: null, telecelCode: null,
};

// Texte tapé : espaces retirés autour, vide = null. Code : sans aucun espace (« *144*10 * MONTANT# »).
const cleanText = (v) => (v == null ? null : String(v).trim().replace(/\s+/g, ' ') || null);
const cleanCode = (v) => (v == null ? null : String(v).replace(/\s+/g, '') || null);

// Ce que le Prestataire a envoyé, nettoyé. Les champs absents ne changent pas.
export function cleanCompanyInput(input = {}) {
  const out = {};
  if (input.mode !== undefined) out.mode = input.mode;
  for (const f of Object.keys(TEXT_FIELDS)) if (input[f] !== undefined) out[f] = cleanText(input[f]);
  for (const f of Object.values(CODE_FIELDS)) if (input[f] !== undefined) out[f] = cleanCode(input[f]);
  return out;
}

// Ce qui manque pour activer le mode Prestataire (liste vide = prêt)
export function missingForPrestataire(c) {
  const missing = [];
  if (!c.companyName) missing.push('le nom de la société');
  if (!c.merchantName) missing.push('le nom affiché au client');
  for (const m of MOBILE_MONEY_METHODS) if (!c[CODE_FIELDS[m]]) missing.push(`le code ${PAYMENT_LABELS[m]}`);
  return missing;
}

// Erreurs de forme : un code rempli doit être utilisable (même règle que les codes ECOFOOD), les noms courts
export function companyFormatError(c) {
  for (const [f, label] of Object.entries(TEXT_FIELDS)) {
    if (c[f] && c[f].length > NAME_MAX) return `${label} : ${NAME_MAX} caractères au plus.`;
  }
  for (const m of MOBILE_MONEY_METHODS) {
    const code = c[CODE_FIELDS[m]];
    if (code && !isValidCodeTemplate(code)) {
      return `Code ${PAYMENT_LABELS[m]} invalide : chiffres, * et #, avec MONTANT à la place du montant, terminé par # (ex. *144*10*12345678*MONTANT#).`;
    }
  }
  return null;
}

// Mode Prestataire possible : tout rempli, et sans erreur
export const companyReady = (c) => missingForPrestataire(c).length === 0 && !companyFormatError(c);

// Mode des nouvelles commandes. Par sécurité, Prestataire seulement si tout est prêt (sinon Restaurant).
export const effectiveMode = (c) => (c?.mode === 'PRESTATAIRE' && companyReady(c) ? 'PRESTATAIRE' : 'RESTAURANT');

// Enregistrement par le Prestataire : null si permis, sinon le message.
// next : la ligne après le changement ; awaitingFees : commandes en mode Prestataire dont les frais sont
// encore attendus (le client va payer sur nos codes : ils ne peuvent pas être vidés ni cassés).
export function companyUpdateError(next, { awaitingFees = 0 } = {}) {
  if (!OPERATORS.includes(next.mode)) return 'Mode de livraison inconnu.';
  const format = companyFormatError(next);
  if (format) return format;
  const missing = missingForPrestataire(next);
  if (next.mode === 'PRESTATAIRE' && missing.length) {
    return `Le mode Prestataire ne peut pas être activé : il manque ${joinFr(missing)}.`;
  }
  if (awaitingFees > 0 && missing.length) {
    const many = awaitingFees > 1;
    return `${awaitingFees} commande${many ? 's' : ''} livrée${many ? 's' : ''} par notre équipe attend${many ? 'ent encore leurs' : ' encore ses'} frais : nos codes et notre nom ne peuvent pas être vidés.`;
  }
  return null;
}

// « a », « a et b », « a, b et c »
export function joinFr(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
}

// Notre compte, au format de env.payment (lu par paymentCodes). Champ vide : « - » (jamais « null »).
export const companyPayment = (c) => ({
  merchantName: c.merchantName || '-',
  codes: Object.fromEntries(MOBILE_MONEY_METHODS.map((m) => [m, c[CODE_FIELDS[m]] || '-'])),
});

// Codes marchands des FRAIS de livraison d'une commande : les nôtres en mode Prestataire, ECOFOOD sinon.
// ctx : messageContext(), avec prestatairePayment chargé pour une commande en mode Prestataire.
export const feePaymentOf = (order, ctx) =>
  order?.deliveryOperator === 'PRESTATAIRE' ? ctx.prestatairePayment || companyPayment(DEFAULT_COMPANY) : ctx.payment;

// Ce qui a changé, pour le journal de sécurité : « Mode : Restaurant → Prestataire ; Code Orange Money changé »
export function companyChanges(before, after) {
  const out = [];
  if (before.mode !== after.mode) out.push(`Mode : ${OPERATOR_LABEL[before.mode]} → ${OPERATOR_LABEL[after.mode]}`);
  for (const [f, label] of Object.entries(TEXT_FIELDS)) {
    if (before[f] !== after[f]) out.push(`${label} : ${before[f] || 'vide'} → ${after[f] || 'vide'}`);
  }
  for (const m of MOBILE_MONEY_METHODS) {
    const f = CODE_FIELDS[m];
    if (before[f] !== after[f]) out.push(`Code ${PAYMENT_LABELS[m]} : ${before[f] || 'vide'} → ${after[f] || 'vide'}`);
  }
  return out;
}
