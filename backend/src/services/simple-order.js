// Lot « Commande simplifiée » (interrupteur COMMANDE_SIMPLIFIEE) : règles du serveur, sans base de données, testées
// dans test/menu-borne-commandes.test.js. Interrupteur fermé : rien ne change.

export const POSITION_REQUIRED = 'Partagez votre position (ou posez un point sur la carte) pour être livré.';

// Une livraison passée sur le site sans position est refusée quand la commande simplifiée est ouverte. Jamais pour
// une commande à récupérer, ni pour une commande saisie par un agent (prise au téléphone, sans position).
export function positionRequiredError({ mode, location, byAgent = false, simpleOpen = false }) {
  if (!simpleOpen || byAgent || mode === 'A_EMPORTER') return null;
  return location ? null : POSITION_REQUIRED;
}

// ─────────── Prix de livraison avec la commande simplifiée ───────────
// Jamais « prix confirmé par notre équipe » : soit un prix calculé, soit un message clair. Trop loin = au-delà de la
// distance maximale du Patron (grille par km), ou de 30 km si elle n'est pas réglée, ou hors de sa grille.
export const DEFAULT_MAX_KM = 30;
export const IMPRECISE_SIMPLE = 'Votre position est trop imprécise : posez un point sur la carte.';
const kmShort = (km) => `${(Math.round(km * 10) / 10).toLocaleString('fr-FR')} km`;
export const tooFarMessage = (km) =>
  `Désolé, vous êtes trop loin pour être livré${km != null ? ` (${kmShort(km)})` : ''}. Posez un point sur la carte, ou choisissez À récupérer.`;

// quote : devis du serveur (peut être { error, tooFar, distanceM }) ; location : position du client ; maxKm : distance
// maximale de la grille par km (null = 30 km) ; maxAccuracy : précision GPS au-delà de laquelle la position ne sert pas.
// Renvoie null si le devis convient, sinon { code, error, km }.
export function simpleQuoteCheck(quote, { location, maxKm = null, maxAccuracy }) {
  if (location?.accuracy != null && location.accuracy > maxAccuracy) return { code: 'POSITION_IMPRECISE', error: IMPRECISE_SIMPLE, km: null };
  const meters = quote.distanceM ?? null;
  const km = meters != null ? Math.round(meters / 100) / 10 : null;
  const limit = maxKm ?? DEFAULT_MAX_KM;
  if (quote.tooFar || (km != null && km > limit) || (!quote.error && quote.fee == null)) return { code: 'TROP_LOIN', error: tooFarMessage(km), km };
  return null;
}
