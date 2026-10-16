// Plan 4, suivi sans WhatsApp : la commande en cours du client, gardée sur son téléphone, et ce qu'il peut faire
// depuis sa page de suivi (alertes, partage du lien). Sans React : testé dans tracking.test.js.
//
// Rien n'est gardé quand le suivi est éteint : le serveur ne donne alors aucune clé (la page reste celle d'avant).

const STORAGE_KEY = 'bc_commande_en_cours';
export const CURRENT_MAX_MS = 24 * 60 * 60 * 1000; // le bandeau « Votre commande en cours » : 24 heures au plus
export const KEY_RE = /^[A-Za-z0-9_-]{24}$/;
const FINAL = ['LIVREE', 'ANNULEE'];

const safeStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// Lien de suivi complet, à garder ou partager
export const trackingUrl = (origin, reference, key) => `${origin}/suivi/${encodeURIComponent(reference)}?cle=${encodeURIComponent(key)}`;

// Clé lue dans l'adresse (?cle=…), sinon celle gardée pour cette commande
export function keyFor(reference, search, current) {
  const fromUrl = search?.get('cle');
  if (KEY_RE.test(fromUrl || '')) return fromUrl;
  return current?.reference === reference && KEY_RE.test(current?.key || '') ? current.key : null;
}

// Commande en cours gardée sur ce téléphone, ou null (absente, illisible, trop vieille ou terminée)
export function readCurrent(storage = safeStorage(), now = Date.now()) {
  try {
    const data = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (!data?.reference || !KEY_RE.test(data.key || '') || typeof data.at !== 'number') return null;
    return { ...data, active: !data.final && now - data.at < CURRENT_MAX_MS };
  } catch {
    return null;
  }
}

// Garde (ou met à jour) la commande en cours ; status : marque la commande terminée (plus de bandeau)
export function saveCurrent({ reference, key, status = null }, storage = safeStorage(), now = Date.now()) {
  try {
    const before = readCurrent(storage, now);
    const same = before?.reference === reference;
    const data = { reference, key, at: same ? before.at : now, final: FINAL.includes(status) || (same && before.final) || false };
    storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

// Bandeau « Votre commande en cours » : pas sur la page de suivi elle-même, ni pendant une commande
export const showCurrentBanner = (current, pathname) =>
  Boolean(current?.active) && !/^\/(suivi|confirmation)\//.test(pathname) && !/^\/(commande|valider)\b/.test(pathname);

// Alertes sur ce téléphone : ce que la page peut proposer.
//   'ok'           le navigateur sait recevoir des alertes ;
//   'ios-install'  iPhone ou iPad hors écran d'accueil : il faut d'abord ajouter le site à l'écran d'accueil ;
//   'unsupported'  impossible (vieux navigateur) : la page se met à jour toute seule, c'est le repli ;
//   'denied'       alertes refusées dans les réglages du téléphone.
export function alertsSupport({ hasPush, ios, standalone, permission }) {
  if (ios && !standalone) return 'ios-install';
  if (!hasPush) return 'unsupported';
  if (permission === 'denied') return 'denied';
  return 'ok';
}

// Clé publique VAPID (base64 « url ») -> octets, format demandé par le navigateur
export function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
