// Nouveau visuel de l'espace équipe (style « application »), sans React : testé dans visual.test.js.
// Apparence seulement : aucune règle, aucun droit, aucun calcul, aucune API ne change. Interrupteur NOUVEAU_VISUEL,
// réglé par le Prestataire, fermé sans ligne (le serveur l'envoie à false) : fermé, inconnu ou illisible = l'espace
// équipe exactement comme avant. Tout le style est dans theme.css, chargé seulement quand l'interrupteur est ouvert.
export const NEW_VISUAL = 'NOUVEAU_VISUEL';

// Ouvert seulement si le serveur dit explicitement true (jamais par défaut, contrairement à hasFeature)
export const isNewVisual = (features) => features?.[NEW_VISUAL] === true;

// Barre d'onglets en bas (téléphone et tablette) : 3 pages au plus selon le rôle, prises dans les pages du panneau
// « ⋮ » (staffPages, nav-pages.js : mêmes droits), puis « Plus », qui ouvre le panneau avec toutes les pages.
const PRIORITY = {
  PATRON: ['Tableau de bord', 'Commandes', 'Menu', 'Caisse'],
  PRESTATAIRE: ['Commandes', 'Tableau de bord', 'Livraison', 'Menu'],
  OPERATEUR: ['Commandes', 'Menu', 'Caisse'],
};
export const MAX_TABS = 4;
export const MORE = { to: null, label: 'Plus', more: true };

export function bottomTabs(role, pages) {
  const order = PRIORITY[role] || PRIORITY.OPERATEUR;
  const picked = order.map((label) => pages.find((p) => p.label === label)).filter(Boolean).slice(0, MAX_TABS - 1);
  return [...picked, MORE];
}

// Livreur et Responsable livraison : leurs propres pages (StaffApp.jsx), le reste dans « Plus »
export function ownTabs(kind) {
  if (kind === 'delivery') return [{ to: '/equipe/livraison', label: 'Livraison', match: /^\/equipe\/livraison/ }, MORE];
  return [
    { to: '/equipe/courses', label: 'Courses', match: /^\/equipe\/courses/ },
    { to: '/equipe/alertes', label: 'Alertes', match: /^\/equipe\/alertes/ },
    MORE,
  ];
}

// « Bonjour » le jour, « Bonsoir » à partir de 18 h (heure du Burkina = UTC)
export const greeting = (date = new Date()) => (date.getUTCHours() >= 18 || date.getUTCHours() < 4 ? 'Bonsoir' : 'Bonjour');
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// Initiales du client dans la carte : « Awa Traoré » -> « AT », « awa » -> « A »
export function initials(name) {
  const words = String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toLocaleUpperCase('fr');
}
// Couleur du carré des initiales : toujours la même pour un même nom (4 teintes du thème)
export const tintOf = (name) => [...String(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % 4;

// Délai de livraison moyen du jour (départ -> remise), à partir des livreurs du tableau de bord (courierStats :
// livraisons et moyenne par livreur), pondéré par le nombre de livraisons. null = aucune livraison chronométrée.
export function avgDelivery(couriers = []) {
  const timed = couriers.filter((c) => c.avgMinutes != null && c.delivered > 0);
  const n = timed.reduce((s, c) => s + c.delivered, 0);
  return n ? Math.round(timed.reduce((s, c) => s + c.avgMinutes * c.delivered, 0) / n) : null;
}

// Étape d'une commande en 4 segments (barre de progression du détail) : 0 paiement, 1 cuisine, 2 en route (ou
// prête à retirer), 3 livrée (ou retirée). -1 : annulée.
export function progressStep(status) {
  switch (status) {
    case 'PAIEMENT_A_VERIFIER': return 0;
    case 'PAYEE':
    case 'EN_PREPARATION':
    case 'PRETE_LIVRAISON': return 1;
    case 'EN_LIVRAISON':
    case 'PRETE': return 2;
    case 'LIVREE': return 3;
    default: return -1;
  }
}

// Couleur de l'étape : orange = à vérifier / en cuisine, bleu = en route, vert = livrée, rouge = en retard
export function toneOf(o, late = false) {
  if (late) return 'red';
  if (o.status === 'EN_LIVRAISON' || o.status === 'PRETE') return 'blue';
  if (o.status === 'LIVREE') return 'green';
  if (o.status === 'ANNULEE') return 'grey';
  return 'orange';
}

// Texte du bouton de la carte (il ouvre le détail, où l'action se fait comme avant) ; null = rien à faire ici
export function cardAction(o, { shortFlow = false } = {}) {
  if (o.status === 'LIVREE') return o.toThank ? 'Remercier le client' : null;
  if (o.noticePending) return 'Prévenir le client';
  const pickup = o.mode === 'A_EMPORTER';
  switch (o.status) {
    case 'PAIEMENT_A_VERIFIER': return shortFlow ? 'Vérifier et lancer' : 'Vérifier le paiement';
    case 'PAYEE': return 'Lancer la préparation';
    case 'EN_PREPARATION':
      if (pickup) return 'Commande prête';
      return o.deliveryOperator === 'PRESTATAIRE' ? 'Prête pour livraison' : 'Choisir le livreur';
    case 'PRETE': return 'Remettre au client';
    default: return null;
  }
}
