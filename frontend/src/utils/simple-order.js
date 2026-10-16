// Lot « Commande simplifiée » (interrupteur COMMANDE_SIMPLIFIEE, fermé par défaut) : règles sans React, testées dans
// simple-order.test.js. Fermé, ou réponse du serveur inconnue : le site actuel, exactement comme avant.

// Le serveur a-t-il ouvert la commande simplifiée ? (GET /api/site : commandeSimple: true, sinon rien)
// stored : dernière réponse gardée sur le téléphone ('1' | '0' | null), pour éviter un clignotement
export function simpleOrderState(stored, answer, done) {
  if (done && answer) return answer.commandeSimple === true;
  return stored === '1';
}

// Position demandée à la carte : position refusée, impossible, ou moins précise que 1 km (comme le serveur)
export const MAX_ACCURACY_M = 1000;
export const needsMap = ({ geoState, geo }) => geoState === 'denied' || geoState === 'unsupported' || (geo?.accuracy != null && geo.accuracy > MAX_ACCURACY_M);

// Point posé sur la carte : la même position que le GPS, sans précision (le client l'a choisie lui-même)
export const mapLocation = ({ lat, lng }) => ({ latitude: +Number(lat).toFixed(6), longitude: +Number(lng).toFixed(6), picked: true });

// Ce que le serveur reçoit de la position (jamais de quartier)
export const locationPayload = (geo) =>
  geo ? { latitude: geo.latitude, longitude: geo.longitude, ...(geo.accuracy != null && !geo.picked && { accuracy: geo.accuracy }) } : undefined;

// Prix de livraison connu (calculé par le serveur) : { fee, km } ; fee null = confirmé par l'équipe
export function deliveryPrice(quote) {
  if (!quote || quote.loading || quote.error) return null;
  return { fee: quote.fee ?? null, km: quote.distanceKm ?? null, estimate: Boolean(quote.estimate) };
}

// Le paiement s'affiche seulement une fois le prix de livraison affiché (tout de suite pour « À récupérer »).
// gridOn : grille des frais active (sinon, pas de prix à calculer : la position suffit, l'équipe donne le prix).
export function paymentVisible({ mode, geo, quote, gridOn }) {
  if (mode === 'A_EMPORTER') return true;
  if (!geo) return false;
  if (!gridOn) return true;
  return deliveryPrice(quote) != null;
}

// Ce que la commande dit du prix de livraison au serveur : le montant affiché, seulement comparé (jamais un prix)
export const deliveryPayload = ({ mode, gridOn, quote }) => {
  if (mode === 'A_EMPORTER' || !gridOn) return undefined;
  const price = deliveryPrice(quote);
  return price ? { expectedFee: price.fee } : {};
};

// Ce qui manque avant d'envoyer (clés de champs, dans l'ordre de la page)
const isPhone = (value) => {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) return true;
  if (digits.length === 11 && digits.startsWith('226')) return true;
  return intl && !digits.startsWith('226') && digits.length >= 10 && digits.length <= 15;
};
export function missingFields(f, { gridOn, quote }) {
  const missing = [];
  if (f.mode === 'LIVRAISON' && !f.geo) missing.push('geo');
  if (f.mode === 'LIVRAISON' && f.geo && gridOn && !deliveryPrice(quote)) missing.push('price');
  if (String(f.name || '').trim().length < 2) missing.push('name');
  if (!isPhone(f.phone)) missing.push('phone');
  if (!f.method) missing.push('method');
  if (!isPhone(f.payer)) missing.push('payer');
  return missing;
}

// Écrans larges (ordinateur, tablette) : panneau « Votre commande » à droite du menu ; téléphone : barre en bas
export const WIDE_QUERY = '(min-width: 900px)';

// Panneau de droite : seulement sur écran large ET avec au moins un plat (panier vide : le menu prend toute la largeur).
// Il disparaît aussi au toucher de « Commander » (on quitte le menu pour la page de commande).
export const sidePanelShown = (wide, count) => Boolean(wide) && count > 0;

// Ligne qui vient d'être ajoutée (nouvelle, ou quantité augmentée), ou null : « + Finest · Menu » quelques secondes
export function addedLine(before = [], after = []) {
  const qty = new Map(before.map((l) => [l.key, l.quantity]));
  const line = after.find((l) => l.quantity > (qty.get(l.key) ?? 0));
  return line ? line.key : null;
}

// Nom court du plat ajouté : le plat, et sa formule s'il en a plusieurs
export const addedLabel = (item) => (item ? `${item.product.name}${item.product.variants.length > 1 ? ` · ${item.variant.label}` : ''}` : null);
