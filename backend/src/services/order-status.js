// Règles des statuts de commande (sans base de données, testées dans test/order-status.test.js).
//
// Livraison  : PAIEMENT_A_VERIFIER -> PAYEE -> EN_PREPARATION -> EN_LIVRAISON -> LIVREE
// À emporter : PAIEMENT_A_VERIFIER -> PAYEE -> EN_PREPARATION -> PRETE -> LIVREE (affichée « Retirée »)
// ANNULEE possible depuis tout statut sauf LIVREE et ANNULEE, avec un motif obligatoire.
// Aucun passage automatique : PAYEE est posé à la main, après vérification sur le téléphone marchand.

export const STATUSES = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'PRETE', 'LIVREE', 'ANNULEE'];
export const MODES = ['LIVRAISON', 'A_EMPORTER'];
export const FLOWS = {
  LIVRAISON: ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE'],
  A_EMPORTER: ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'PRETE', 'LIVREE'],
};
export const FLOW = FLOWS.LIVRAISON;
export const ACTIVE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'PRETE'];
export const INITIAL_STATUS = 'PAIEMENT_A_VERIFIER';
export const isPickup = (order) => order?.mode === 'A_EMPORTER';

export const STATUS_LABEL = {
  PAIEMENT_A_VERIFIER: 'Paiement à vérifier',
  PAYEE: 'Payée',
  EN_PREPARATION: 'En préparation',
  EN_LIVRAISON: 'En livraison',
  PRETE: 'Prête à retirer',
  LIVREE: 'Livrée',
  ANNULEE: 'Annulée',
};
// Libellé selon le mode : une commande à emporter remise au comptoir est « Retirée »
export const statusLabel = (status, mode) => (mode === 'A_EMPORTER' && status === 'LIVREE' ? 'Retirée' : STATUS_LABEL[status]);

export const nextStatus = (status, mode = 'LIVRAISON') => {
  const flow = FLOWS[mode] || FLOW;
  const i = flow.indexOf(status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
};

export const canCancel = (status) => ACTIVE.includes(status);

// Renvoie null si le changement est permis, sinon le message d'erreur (en français)
export function transitionError(from, to, reason, mode = 'LIVRAISON') {
  if (!STATUSES.includes(to)) return 'Statut inconnu.';
  if (from === to) return `La commande est déjà « ${statusLabel(to, mode)} ».`;
  if (to === 'ANNULEE') {
    if (!canCancel(from)) return `Une commande « ${statusLabel(from, mode)} » ne peut plus être annulée.`;
    if (!reason || reason.trim().length < 3) return "Indiquez le motif de l'annulation.";
    return null;
  }
  if (nextStatus(from, mode) !== to) {
    return `Passage impossible de « ${statusLabel(from, mode)} » à « ${statusLabel(to, mode)} ».`;
  }
  return null;
}

// ─────────── Frais de livraison ───────────
// Saisis par l'équipe selon le quartier (au moins 1 F), avec la confirmation du paiement.
// Le client les paie AU LIVREUR, à la réception : en espèces, ou par mobile money avec le code marchand.
// Le livreur (ou l'agent qui valide sans code) note comment ils ont été payés ; le mobile money est
// ensuite vérifié par l'équipe sur le téléphone marchand, les espèces remises au restaurant (cash.js).
export const FEE_MIN = 1;
export const FEE_MAX = 50000;
export const FEE_METHODS = ['ESPECES', 'MOBILE_MONEY'];
export const FEE_METHOD_LABEL = { ESPECES: 'Espèces', MOBILE_MONEY: 'Mobile money (code marchand)' };
// Les frais se modifient tant que le livreur n'est pas parti
const FEE_EDITABLE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION'];

// Frais déjà réglés avant la remise : seulement les anciennes commandes (avant le 6 octobre 2026),
// dont les frais étaient payés avant le départ du livreur. Le livreur n'encaisse alors rien.
export const feeAlreadyPaid = (order) => order.deliveryFeeMethod != null;

// Avant le départ du livreur : null si permis, sinon le message
export function deliveryError(order) {
  if (order.deliveryFee == null) return 'Saisissez d’abord les frais de livraison : le livreur les encaisse à la réception.';
  return null;
}

// Saisie ou modification du montant
export function feeEditError(order) {
  if (isPickup(order)) return 'Commande à emporter : pas de frais de livraison.';
  if (!FEE_EDITABLE.includes(order.status)) return 'Les frais ne se modifient plus une fois le livreur parti.';
  if (feeAlreadyPaid(order)) return 'Les frais de cette commande sont déjà payés.';
  return null;
}

// Confirmer le paiement : les frais de livraison sont donnés en même temps, car le message
// « paiement confirmé » les annonce au client
// À emporter : pas de frais de livraison.
export function paymentConfirmError(fee, mode = 'LIVRAISON') {
  if (mode === 'A_EMPORTER') return fee == null ? null : 'Commande à emporter : pas de frais de livraison.';
  if (fee == null) return 'Indiquez les frais de livraison : ils sont annoncés au client avec la confirmation du paiement.';
  if (!Number.isInteger(fee) || fee < FEE_MIN || fee > FEE_MAX) return 'Frais de livraison invalides (de 1 F à 50 000 F).';
  return null;
}

// À la remise (livreur avec le code, ou agent sans code) : comment le client a payé les frais.
// Obligatoire, sauf si les frais étaient déjà payés (anciennes commandes).
export function feeMethodError(order, method) {
  if (isPickup(order)) return null;
  if (feeAlreadyPaid(order)) return null;
  if (!FEE_METHODS.includes(method)) return 'Indiquez comment le client a payé les frais de livraison : espèces ou mobile money.';
  return null;
}

// Cocher (verified = true) ou décocher « Frais vérifiés » : mobile money seulement, une fois livrée
export function feeVerifyError(order, verified) {
  if (order.deliveryFeeMethod !== 'MOBILE_MONEY') return 'Ces frais n’ont pas été payés par mobile money.';
  if (order.status !== 'LIVREE') return 'Les frais se vérifient une fois la commande livrée.';
  if (verified && order.deliveryFeeVerifiedAt) return 'Ces frais sont déjà vérifiés.';
  if (!verified && !order.deliveryFeeVerifiedAt) return 'Ces frais ne sont pas encore vérifiés.';
  return null;
}
