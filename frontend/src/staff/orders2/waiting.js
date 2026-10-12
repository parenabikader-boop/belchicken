// Lot 12, page Commandes plus lisible : règles sans affichage (testées dans waiting.test.js).
// Temps d'attente compté depuis le DÉBUT DE L'ÉTAPE (o.stageSince, donné par le serveur), pas depuis la commande.
// Seuils validés par le client le 12 octobre 2026 pour démarrer ; plus tard modifiables par le Patron (feuille de
// route, lot 12) : ils sont réunis ici pour cela.

// [orange à partir de, rouge à partir de], en minutes, par étape
export const THRESHOLDS = {
  PAIEMENT_A_VERIFIER: [5, 10],
  PAYEE: [5, 10],
  EN_PREPARATION: [25, 40],
  PRETE_LIVRAISON: [10, 20],
  EN_LIVRAISON: [40, 60],
  PRETE: [30, 60],
  A_REMERCIER: [30, 120],
};

// Étape d'une commande pour les seuils : une livrée pas encore remerciée est « à remercier »
export const waitKey = (o) => (o.status === 'LIVREE' && o.toThank ? 'A_REMERCIER' : o.status);

export function waitMinutes(o, now = Date.now()) {
  const since = new Date(o.stageSince || o.createdAt).getTime();
  return Math.max(0, Math.floor((now - since) / 60000));
}

// 'ok', 'warn' (orange), 'late' (rouge) ; null pour une commande terminée (historique, annulée)
export function waitLevel(o, now = Date.now()) {
  const t = THRESHOLDS[waitKey(o)];
  if (!t) return null;
  const min = waitMinutes(o, now);
  return min >= t[1] ? 'late' : min >= t[0] ? 'warn' : 'ok';
}

// « 3 min », « 1 h 05 », « 2 j »
export function waitText(min) {
  if (min < 1) return 'à l’instant';
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(min / (24 * 60))} j`;
}

// Plus longue attente à l'étape en haut
export const byWait = (a, b) => new Date(a.stageSince || a.createdAt) - new Date(b.stageSince || b.createdAt);

// Étapes de la page (façon B, choisie par le client le 12 octobre 2026) : seules les étapes qui ont des commandes
// sont affichées (visible) ; les autres (empty) sont résumées en une ligne (nothingLine). « Payées » n'apparaît
// nulle part quand le parcours court est allumé et qu'elle est vide (personne n'y passe).
export function boardColumns(stages, countOf, { shortFlow = false } = {}) {
  const all = stages
    .map((s) => ({ stage: s, count: countOf(s.id) || 0 }))
    .filter(({ stage, count }) => !(stage.id === 'PAYEE' && shortFlow && count === 0));
  return { visible: all.filter((c) => c.count > 0), empty: all.filter((c) => c.count === 0) };
}

// Ligne des étapes vides : « Rien à vérifier, rien en préparation. » ; null s'il n'y en a pas
export const NOTHING = {
  PAIEMENT_A_VERIFIER: 'rien à vérifier',
  PAYEE: 'rien à lancer',
  EN_PREPARATION: 'rien en préparation',
  EN_LIVRAISON: 'rien en livraison',
  PRETE: 'rien à retirer',
  A_REMERCIER: 'personne à remercier',
};
export function nothingLine(empty) {
  const parts = empty.map((c) => NOTHING[c.stage.id]).filter(Boolean);
  if (!parts.length) return null;
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// Onglet « Tout » (téléphone et tablette) : les rouges d'abord, puis les orange, puis les autres ; à couleur égale,
// la plus avancée vers son seuil rouge d'abord (une commande à vérifier depuis 8 min passe avant une préparation
// de 20 min)
const RANK = { late: 0, warn: 1, ok: 2 };
export const byUrgency = (now = Date.now()) => (a, b) => {
  const la = waitLevel(a, now);
  const lb = waitLevel(b, now);
  if (la !== lb) return (RANK[la] ?? 3) - (RANK[lb] ?? 3);
  const ratio = (o) => waitMinutes(o, now) / (THRESHOLDS[waitKey(o)]?.[1] || 1);
  return ratio(b) - ratio(a);
};

// Bandeau du haut : commandes en cours, en retard (rouge), à surveiller (orange), messages à confirmer
export function summary(orders, now = Date.now()) {
  const levels = orders.map((o) => waitLevel(o, now)).filter(Boolean);
  return {
    total: levels.length,
    late: levels.filter((l) => l === 'late').length,
    warn: levels.filter((l) => l === 'warn').length,
    notice: orders.filter((o) => o.noticePending).length,
  };
}

// Nom court d'une étape dans les onglets et au-dessus des cartes (labels.js, partagé avec la page actuelle, ne change pas)
const SHORT_LABEL = { A_REMERCIER: 'À remercier' };
export const shortLabel = (stage) => SHORT_LABEL[stage.id] || stage.label;
