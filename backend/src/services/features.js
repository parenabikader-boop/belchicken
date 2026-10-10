// Lot 4 : fonctions incluses dans la formule, ouvertes ou fermées par le Prestataire (sans base de données,
// testé dans test/prestataire.test.js). Les accès à la base sont dans features.service.js.
//
// Pas de ligne FeatureSwitch = ouvert : sans Prestataire, tout fonctionne comme avant.
// Fermer bloque l'accès, ne supprime aucune donnée, et bloque aussi le Prestataire (il doit rouvrir).
// Deux niveaux pour les réglages : le Prestataire décide si une fonction est incluse, le Patron l'allume
// ou l'éteint à l'intérieur. Une fonction n'est active que si elle est incluse et allumée.
// Les fonctions des lots suivants (relevés, avis, ventes…) s'ajoutent ici, sans changer la base.
export const FEATURES = [
  { key: 'HISTORIQUE', label: 'Historique des commandes', help: 'Fermé : seules restent visibles les commandes en cours, à remercier, et celles terminées depuis moins de 24 heures.' },
  { key: 'TABLEAU_DE_BORD', label: 'Tableau de bord', help: 'Chiffres, plats les plus vendus, heures de pointe.' },
  { key: 'CAISSE', label: 'Caisse', help: 'Frais à vérifier et espèces des livreurs.' },
  { key: 'FRAIS_LIVRAISON', label: 'Page Frais de livraison', help: 'Fermé : la page du Patron est cachée, la grille continue de calculer les frais pour les clients.' },
  { key: 'REGLAGES', label: 'Réglages et provenances', help: 'Fermé : le Patron ne peut plus changer les réglages ni les provenances (ils restent comme ils sont).' },
  { key: 'PARCOURS_COURT', label: 'Parcours court', help: 'Fermé : comme si le Patron l’avait éteint.' },
  { key: 'PRISE_COMMANDE_AGENT', label: 'Prise de commande par l’agent', help: 'Fermé : comme si le Patron l’avait éteinte. Les commandes déjà saisies gardent leur provenance.' },
  { key: 'SUPPLEMENT_NUIT', label: 'Supplément de nuit', help: 'Fermé : comme si le Patron l’avait éteint. Les commandes déjà passées gardent leurs frais.' },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export const FEATURE_CLOSED = 'Fonction non incluse dans votre formule, contactez votre prestataire.';

// Lignes FeatureSwitch -> { HISTORIQUE: true, … } : une fonction sans ligne est ouverte
export function featureMap(rows = []) {
  const closed = new Set(rows.filter((r) => r.enabled === false).map((r) => r.key));
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, !closed.has(key)]));
}

// Historique fermé : les commandes terminées (livrées ou annulées) restent visibles 24 heures
export const HISTORY_HOURS = 24;
export const historyCutoff = (now = new Date()) => new Date(now.getTime() - HISTORY_HOURS * 60 * 60 * 1000);
