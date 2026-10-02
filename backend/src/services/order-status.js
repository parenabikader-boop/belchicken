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
