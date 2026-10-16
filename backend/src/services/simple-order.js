// Lot « Commande simplifiée » (interrupteur COMMANDE_SIMPLIFIEE) : règles du serveur, sans base de données, testées
// dans test/menu-borne-commandes.test.js. Interrupteur fermé : rien ne change.

export const POSITION_REQUIRED = 'Partagez votre position (ou posez un point sur la carte) pour être livré.';

// Une livraison passée sur le site sans position est refusée quand la commande simplifiée est ouverte. Jamais pour
// une commande à récupérer, ni pour une commande saisie par un agent (prise au téléphone, sans position).
export function positionRequiredError({ mode, location, byAgent = false, simpleOpen = false }) {
  if (!simpleOpen || byAgent || mode === 'A_EMPORTER') return null;
  return location ? null : POSITION_REQUIRED;
}
