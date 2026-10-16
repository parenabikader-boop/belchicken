// Lot 4 : fonctions incluses dans la formule, ouvertes ou fermées par le Prestataire (sans base de données,
// testé dans test/prestataire.test.js). Les accès à la base sont dans features.service.js.
//
// Pas de ligne FeatureSwitch = ouvert : sans Prestataire, tout fonctionne comme avant (sauf RELEVE, lot 5d,
// fermé sans ligne : le Patron ne voit le relevé que si le Prestataire l'ouvre ; de même LIVREURS_INDEPENDANTS,
// NOUVEAU_VISUEL, CALL_CENTER_ALLEGE, SUIVI_SANS_WHATSAPP, FRAIS_PAR_KM et PAIEMENT_AUTO, fermés sans ligne).
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
  // Lot 11 : menu façon borne, ouvert sans ligne ; le Patron l'allume en plus (réglage « Menu façon borne »)
  { key: 'MENU_BORNE', label: 'Menu façon borne', help: 'Menu du site client en plein écran, comme les bornes du restaurant (si le Patron l’allume). Fermé : le menu actuel du site.' },
  // Lot 12 : nouvelle page Commandes, ouverte sans ligne ; le Patron l'allume en plus (réglage « Nouvelle page Commandes et barre ⋮ »)
  { key: 'NOUVELLE_PAGE_COMMANDES', label: 'Nouvelle page Commandes et barre ⋮', help: 'Page Commandes plus lisible les soirs d’affluence, avec les couleurs d’attente, barre simple en haut de l’espace équipe (bouton ⋮ qui ouvre toutes les pages) et page d’arrivée selon le rôle (Patron : Tableau de bord), si le Patron l’allume. Fermé : la page Commandes, la barre et la page d’arrivée actuelles.' },
  // Lot 5d : interrupteur fermé sans ligne (defaultOpen: false), et qui ne concerne que le Patron :
  // le Prestataire et le Responsable livraison voient toujours le relevé (le Responsable sans les conditions
  // du contrat ni le montant dû, statement.js).
  { key: 'RELEVE', label: 'Relevé de livraison (Patron)', help: 'Ouvert : le Patron voit le relevé de notre équipe de livraison (livraisons, frais, délais, conditions du contrat et montant dû), en lecture seule. Fermé : le relevé lui est caché ; vous et le Responsable livraison le voyez toujours.', defaultOpen: false },
  // Mode « Livreurs indépendants » : fermé sans ligne. Ouvert, le troisième choix du « Mode de livraison » apparaît
  // (page Prestataire) et le Patron peut créer des comptes Livreur « Indépendant » (page Équipe).
  { key: 'LIVREURS_INDEPENDANTS', label: 'Livreurs indépendants', help: 'Ouvert : troisième choix du mode de livraison, avec des livreurs indépendants créés par le Patron. Les frais de livraison se règlent directement entre le client et le livreur : aucun montant de livraison dans les commandes, la Caisse, les ventes ni le tableau de bord. Fermé : modes Restaurant et Prestataire seulement, comme avant.', defaultOpen: false },
  // Nouveau visuel de l'espace équipe (style application) : fermé sans ligne, réglé par le Prestataire seulement.
  // Apparence seulement : aucune règle, aucun droit, aucun calcul ne change.
  { key: 'NOUVEAU_VISUEL', label: 'Nouveau visuel de l’espace équipe', help: 'Ouvert : espace équipe au style « application » (cartes, gros boutons, barre d’onglets en bas sur téléphone). Apparence seulement : rien d’autre ne change. Fermé : l’espace équipe actuel.', defaultOpen: false },
  // Plan 1, call center allégé : fermé sans ligne. Ouvert, aucune étape n'attend plus un message au client (sauf
  // le remerciement), « Paiement vérifié » imprime le bon, et le livreur peut valider sans code avec un motif.
  // Plan 4, suivi sans WhatsApp : fermé sans ligne. Ouvert, le client suit sa commande sur sa page (lien avec clé
  // secrète) et reçoit des alertes gratuites ; plus de message à confirmer ni de remerciement pour le call center.
  // Plan 3, frais par kilomètre avant le paiement : fermé sans ligne. Ouvert, le Patron règle sa grille par km
  // (page Frais de livraison) ; allumée, le client voit et accepte ses frais avant de payer son repas.
  // Plan 2, paiement du repas validé automatiquement : fermé sans ligne. Ouvert, un paiement reconnu (SMS du téléphone
  // marchand, ou Ligdicash) valide seul la commande ; sinon, le call center vérifie comme avant.
  { key: 'PAIEMENT_AUTO', label: 'Paiement du repas validé automatiquement', help: 'Ouvert : quand le téléphone marchand reçoit le SMS d’un paiement (numéro qui a payé et montant exact d’une seule commande en attente), la commande est validée toute seule. Rien ne correspond, ou deux commandes possibles : la commande reste « à vérifier » par le call center, comme avant. Fermé : comme avant.', defaultOpen: false },
  { key: 'FRAIS_PAR_KM', label: 'Frais par kilomètre avant le paiement', help: 'Ouvert : le Patron règle une grille par kilomètre (prix de départ, prix par km, arrondi, minimum, maximum) ; une fois allumée, le site calcule les frais avec la distance par la route, le client les voit (« Livraison : X F (Y km), à payer au livreur ») et les accepte avant de payer son repas. Sans position, il choisit son quartier ; « Autre quartier » n’est plus proposé ; le call center ne corrige plus les frais (le Patron, toujours avec un motif). Fermé : comme avant.', defaultOpen: false },
  { key: 'SUIVI_SANS_WHATSAPP', label: 'Suivi sans WhatsApp', help: 'Ouvert : le client suit sa commande en direct sur sa page de suivi (lien secret donné à la commande : livreur à appeler, code de livraison, montant à payer au livreur, avis) et reçoit des alertes gratuites sur son téléphone (« en route », « livrée, merci »). Le call center n’a plus de message à confirmer ni de client à remercier. Fermé : comme avant.', defaultOpen: false },
  { key: 'CALL_CENTER_ALLEGE', label: 'Call center allégé', help: 'Ouvert : aucune étape n’attend plus la confirmation d’un message au client (le message reste proposé, sauf le remerciement qui reste demandé) ; « Paiement vérifié » imprime aussi le bon ; le livreur peut valider une livraison sans le code du client, avec un motif obligatoire (signalée en rouge au Responsable livraison et comptée à part dans le relevé). Fermé : comme avant.', defaultOpen: false },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

// Plan 1 : clé de l'interrupteur « Call center allégé »
export const CALL_CENTER_LIGHT = 'CALL_CENTER_ALLEGE';
// Plan 4 : clé de l'interrupteur « Suivi sans WhatsApp »
export const CUSTOMER_TRACKING = 'SUIVI_SANS_WHATSAPP';
// Plan 3 : clé de l'interrupteur « Frais par kilomètre avant le paiement »
export const FEES_BY_KM = 'FRAIS_PAR_KM';
// Plan 2 : clé de l'interrupteur « Paiement du repas validé automatiquement »
export const AUTO_PAYMENT = 'PAIEMENT_AUTO';

export const FEATURE_CLOSED = 'Fonction non incluse dans votre formule, contactez votre prestataire.';

// Ouverte ou fermée quand elle n'a pas de ligne : ouverte, sauf RELEVE (lot 5d), LIVREURS_INDEPENDANTS, NOUVEAU_VISUEL
// CALL_CENTER_ALLEGE, SUIVI_SANS_WHATSAPP, FRAIS_PAR_KM et PAIEMENT_AUTO
export const featureDefault = (key) => FEATURES.find((f) => f.key === key)?.defaultOpen ?? true;

// Lignes FeatureSwitch -> { HISTORIQUE: true, … } : une fonction sans ligne garde sa valeur par défaut
export function featureMap(rows = []) {
  const byKey = new Map(rows.filter((r) => typeof r.enabled === 'boolean').map((r) => [r.key, r.enabled]));
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, byKey.has(key) ? byKey.get(key) : featureDefault(key)]));
}

// Historique fermé : les commandes terminées (livrées ou annulées) restent visibles 24 heures
export const HISTORY_HOURS = 24;
export const historyCutoff = (now = new Date()) => new Date(now.getTime() - HISTORY_HOURS * 60 * 60 * 1000);
