// Compte Patron simplifié (interrupteur COMPTE_PATRON_SIMPLE du Prestataire, fermé par défaut), sans React : testé dans
// patron-simple.test.js. Fermé : le compte Patron comme avant. Ouvert : 5 onglets seulement ; Commandes, Caisse,
// Réglages et Accueil du site restent gérés par le Prestataire (rien n'est supprimé, l'API ne change pas de droits).
export const PATRON_SIMPLE = 'COMPTE_PATRON_SIMPLE';
export const PATRON_HOME = '/equipe/comptes';

// Seul le rôle Patron change ; le Prestataire garde tout (il voit la page Comptes en plus)
export const isPatronSimple = (role, features) => role === 'PATRON' && features?.[PATRON_SIMPLE] === true;

// Onglets du Patron, dans l'ordre ; Frais de livraison et Avis seulement si le Prestataire ne les a pas fermés
export function patronTabs(hasFeature) {
  return [
    { to: PATRON_HOME, label: 'Comptes', match: /^\/equipe\/comptes/ },
    { to: '/equipe/menu', label: 'Menu', match: /^\/equipe\/menu/ },
    hasFeature('FRAIS_LIVRAISON') && { to: '/equipe/frais-livraison', label: 'Frais', long: 'Frais de livraison', match: /^\/equipe\/frais-livraison/ },
    { to: '/equipe/equipe', label: 'Équipe', match: /^\/equipe\/equipe/ },
    hasFeature('AVIS') && { to: '/equipe/avis', label: 'Avis', match: /^\/equipe\/avis/ },
  ].filter(Boolean);
}

export const PERIODS = [
  { id: 'jour', label: 'Aujourd’hui' },
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
  { id: 'dates', label: 'Dates' },
];

// Paramètres de l'adresse /api/staff/comptes
export function accountsQuery(periode, du, au) {
  const p = PERIODS.some((x) => x.id === periode) ? periode : 'jour';
  return p === 'dates' ? { periode: p, du, au } : { periode: p };
}

// « +12 % », « −8 % », « = », null sans comparaison
export function changeText(pct) {
  if (pct == null) return null;
  if (pct === 0) return '=';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

// Hausse des annulations = mauvaise nouvelle
export function changeTone(pct, upIsBad = false) {
  if (pct == null || pct === 0) return 'flat';
  return (pct > 0) !== upIsBad ? 'up' : 'down';
}

// Heures montrées : de 10 h à 23 h, élargies si des ventes tombent plus tôt ou plus tard
export function hourWindow(hours) {
  const used = hours.filter((h) => h.count).map((h) => h.hour);
  return hours.slice(Math.min(10, ...used), Math.max(23, ...used) + 1);
}

// ─── Lot B ───

// Application installable du Patron : icône Belchicken (celle du site client, sans « Équipe »), ouverte sur Comptes.
// Remplace le manifeste « Belchicken Équipe » pendant que le compte Patron simplifié est affiché (PatronShell.jsx).
export const PATRON_APP = { manifest: '/patron.webmanifest', appleIcon: '/icons/client-apple-180.png', appleTitle: 'BC Patron' };

// Rapport du mois « AAAA-MM » : du 1er au dernier jour, ou jusqu'à aujourd'hui pour le mois en cours.
// null si le mois est mal écrit ou pas encore commencé.
export function monthRange(mois, today) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mois || ''))) return null;
  const [y, m] = mois.split('-').map(Number);
  const du = `${mois}-01`;
  if (du > today) return null;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { du, au: last < today ? last : today, complete: last < today };
}

// Mois d'avant « AAAA-MM »
export function previousMonth(mois) {
  const [y, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}
