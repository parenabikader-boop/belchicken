// Règles des statuts de commande (sans base de données, testées dans test/order-status.test.js).
//
// PAIEMENT_A_VERIFIER -> PAYEE -> EN_PREPARATION -> EN_LIVRAISON -> LIVREE
// ANNULEE possible depuis tout statut sauf LIVREE et ANNULEE, avec un motif obligatoire.
// Aucun passage automatique : PAYEE est posé à la main, après vérification sur le téléphone marchand.

export const STATUSES = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE', 'ANNULEE'];
export const FLOW = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE'];
export const ACTIVE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON'];
export const INITIAL_STATUS = 'PAIEMENT_A_VERIFIER';

export const STATUS_LABEL = {
  PAIEMENT_A_VERIFIER: 'Paiement à vérifier',
  PAYEE: 'Payée',
  EN_PREPARATION: 'En préparation',
  EN_LIVRAISON: 'En livraison',
  LIVREE: 'Livrée',
  ANNULEE: 'Annulée',
};

export const nextStatus = (status) => {
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
};

export const canCancel = (status) => ACTIVE.includes(status);

// Renvoie null si le changement est permis, sinon le message d'erreur (en français)
export function transitionError(from, to, reason) {
  if (!STATUSES.includes(to)) return 'Statut inconnu.';
  if (from === to) return `La commande est déjà « ${STATUS_LABEL[to]} ».`;
  if (to === 'ANNULEE') {
    if (!canCancel(from)) return `Une commande « ${STATUS_LABEL[from]} » ne peut plus être annulée.`;
    if (!reason || reason.trim().length < 3) return "Indiquez le motif de l'annulation.";
    return null;
  }
  if (nextStatus(from) !== to) {
    return `Passage impossible de « ${STATUS_LABEL[from]} » à « ${STATUS_LABEL[to]} ».`;
  }
  return null;
}

// ─────────── Frais de livraison ───────────
// Saisis par l'équipe selon le quartier (au moins 1 F), puis cochés « reçus » après vérification
// sur le téléphone marchand. Le livreur ne part (EN_LIVRAISON) qu'une fois les frais saisis et reçus.
export const FEE_MIN = 1;
export const FEE_MAX = 50000;
// Les frais se modifient tant que le livreur n'est pas parti
const FEE_EDITABLE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION'];

// Avant le départ du livreur : null si permis, sinon le message
export function deliveryError(order) {
  if (order.deliveryFee == null) return 'Saisissez d’abord les frais de livraison : le livreur part une fois les frais reçus.';
  if (!order.deliveryFeeReceivedAt) return 'Frais de livraison pas encore reçus : le livreur part une fois les frais reçus. Cochez « Frais reçus » après vérification sur le téléphone marchand.';
  return null;
}

// Saisie ou modification du montant
export function feeEditError(order) {
  if (!FEE_EDITABLE.includes(order.status)) return 'Les frais ne se modifient plus à cette étape.';
  if (order.deliveryFeeReceivedAt) return 'Les frais sont déjà reçus : décochez « Frais reçus » pour modifier le montant.';
  return null;
}

// Cocher (received = true) ou décocher « Frais reçus »
export function feeReceivedError(order, received) {
  if (!FEE_EDITABLE.includes(order.status)) return 'Les frais ne se modifient plus à cette étape.';
  if (received) {
    if (order.deliveryFee == null) return 'Saisissez d’abord le montant des frais de livraison.';
    if (order.deliveryFeeReceivedAt) return 'Les frais sont déjà notés comme reçus.';
  } else if (!order.deliveryFeeReceivedAt) {
    return 'Les frais ne sont pas notés comme reçus.';
  }
  return null;
}

// Confirmer le paiement : les frais de livraison sont donnés en même temps, car le message
// « paiement confirmé » les annonce au client
export function paymentConfirmError(fee) {
  if (fee == null) return 'Indiquez les frais de livraison : ils sont annoncés au client avec la confirmation du paiement.';
  if (!Number.isInteger(fee) || fee < FEE_MIN || fee > FEE_MAX) return 'Frais de livraison invalides (de 1 F à 50 000 F).';
  return null;
}

// La préparation commence une fois les frais reçus (le message « frais reçus » dit « en préparation »)
export function preparationError(order) {
  if (order.deliveryFeeReceivedAt) return null;
  return 'Cochez d’abord « Frais reçus » : la préparation commence une fois les frais reçus.';
}
