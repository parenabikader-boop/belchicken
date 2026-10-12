// Lot 4 : fonctions incluses dans la formule, ouvertes ou fermées par le Prestataire (sans base de données,
// testé dans test/prestataire.test.js). Les accès à la base sont dans features.service.js.
//
// Pas de ligne FeatureSwitch = ouvert : sans Prestataire, tout fonctionne comme avant (sauf RELEVE, lot 5d,
// fermé sans ligne : le Patron ne voit le relevé que si le Prestataire l'ouvre).
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
  { key: 'TOURNEES_RESTAURANT', label: 'Tournées et disponibilité des livreurs du restaurant', help: 'Fermé : comme si le Patron l’avait éteint. Les livreurs du restaurant fonctionnent comme avant ; notre équipe de livraison n’est pas concernée.' },
  // Lot 6 : ventes par période, provenance et agent (Patron et Prestataire), ouvert sans ligne
  { key: 'VENTES', label: 'Ventes', help: 'Ventes par période, par provenance et par agent, avec l’export Excel et PDF (Patron).' },
  // Lot 7 : avis des clients, ouvert sans ligne ; le Patron l'allume en plus (réglage « Demander l'avis des clients »)
  { key: 'AVIS', label: 'Avis des clients', help: 'Lien « Donnez votre avis » dans le message de remerciement (si le Patron l’allume), notes et commentaires, alerte en cas de mauvaise note. Fermé : plus de lien ni d’avis reçu, les avis déjà reçus sont gardés.' },
  // Lot 8 : site client en anglais, ouvert sans ligne ; le Patron l'allume en plus (réglage « Site en anglais »)
  { key: 'ANGLAIS', label: 'Site en anglais', help: 'Bouton FR / EN sur le site client (si le Patron l’allume). Les messages WhatsApp et l’espace équipe restent en français. Fermé : site en français seulement, sans bouton.' },
  // Lot 5d : seul interrupteur fermé sans ligne (defaultOpen: false), et qui ne concerne que le Patron :
  // le Prestataire et le Responsable livraison voient toujours le relevé (le Responsable sans les conditions
  // du contrat ni le montant dû, statement.js).
  { key: 'RELEVE', label: 'Relevé de livraison (Patron)', help: 'Ouvert : le Patron voit le relevé de notre équipe de livraison (livraisons, frais, délais, conditions du contrat et montant dû), en lecture seule. Fermé : le relevé lui est caché ; vous et le Responsable livraison le voyez toujours.', defaultOpen: false },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export const FEATURE_CLOSED = 'Fonction non incluse dans votre formule, contactez votre prestataire.';

// Ouverte ou fermée quand elle n'a pas de ligne : ouverte, sauf RELEVE (lot 5d)
export const featureDefault = (key) => FEATURES.find((f) => f.key === key)?.defaultOpen ?? true;

// Lignes FeatureSwitch -> { HISTORIQUE: true, … } : une fonction sans ligne garde sa valeur par défaut
export function featureMap(rows = []) {
  const byKey = new Map(rows.filter((r) => typeof r.enabled === 'boolean').map((r) => [r.key, r.enabled]));
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, byKey.has(key) ? byKey.get(key) : featureDefault(key)]));
}

// Historique fermé : les commandes terminées (livrées ou annulées) restent visibles 24 heures
export const HISTORY_HOURS = 24;
export const historyCutoff = (now = new Date()) => new Date(now.getTime() - HISTORY_HOURS * 60 * 60 * 1000);
