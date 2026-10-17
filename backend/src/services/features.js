// Lot 4 : fonctions incluses dans la formule, ouvertes ou fermées par le Prestataire (sans base de données,
// testé dans test/prestataire.test.js). Les accès à la base sont dans features.service.js.
//
// Pas de ligne FeatureSwitch = ouvert : sans Prestataire, tout fonctionne comme avant (sauf RELEVE, lot 5d,
// fermé sans ligne : le Patron ne voit le relevé que si le Prestataire l'ouvre ; de même LIVREURS_INDEPENDANTS,
// NOUVEAU_VISUEL, CALL_CENTER_ALLEGE, SUIVI_SANS_WHATSAPP, FRAIS_PAR_KM, PAIEMENT_AUTO_SMS, PAIEMENT_SMS_ESSAI, PAIEMENT_LIGDICASH, COMMANDE_SIMPLIFIEE,
// TRANCHES_PAR_ROUTE et COMPTE_PATRON_SIMPLE, fermés sans ligne).
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
  // marchand, ou Ligdicash : deux interrupteurs) valide seul la commande ; sinon, le call center vérifie comme avant.
  // Lot « Commande simplifiée » : fermé sans ligne. Ouvert, le site client a un parcours court : panneau « Ma
  // commande » sur le menu, une seule page de commande (position ou point sur la carte, jamais de quartier).
  // Tranches de distance mesurées par la route (OpenRouteService, sinon vol d'oiseau × 1,3) : fermé sans ligne.
  { key: 'TRANCHES_PAR_ROUTE', label: 'Tranches de distance par la route', help: 'Ouvert : les tranches de distance de la page Frais de livraison se mesurent par la route depuis le restaurant (comme la distance annoncée au client), au lieu de la ligne droite. Sans service de distance : ligne droite × 1,3, notée « estimation ». Fermé : à vol d’oiseau, comme avant.', defaultOpen: false },
  { key: 'COMMANDE_SIMPLIFIEE', label: 'Commande simplifiée (site client)', help: 'Ouvert : sur le menu, la barre « Voir ma commande » ouvre un panneau par-dessus le menu ; une seule page de commande, dans l’ordre : livraison ou à récupérer, position (ou point sur une carte) et prix de livraison, nom et téléphone, puis le paiement. Plus aucun quartier à choisir. Très peu de texte. Fermé : le site actuel.', defaultOpen: false },
  // Plan 2 : deux interrupteurs indépendants (Belchicken choisit l'un ou l'autre ; les deux fermés = vérification à la
  // main, comme avant ; les deux ouverts = chaque commande validée une seule fois, AutoPayment.orderId unique)
  { key: 'PAIEMENT_AUTO_SMS', label: 'Paiement automatique par SMS', help: 'Ouvert : quand le téléphone marchand reçoit le SMS d’un paiement (numéro qui a payé et montant exact d’une seule commande en attente), la commande est validée toute seule. Rien ne correspond, ou deux commandes possibles : la commande reste « à vérifier » par le call center, comme avant. Fermé : les SMS ne sont plus lus (Ligdicash n’est pas concerné).', defaultOpen: false },
  { key: 'PAIEMENT_SMS_ESSAI', label: 'Formats SMS d’essai', help: 'Ouvert : les formats marqués « essai » (Orange Money, transfert reçu sur un téléphone personnel) valident aussi les commandes, avec le paiement automatique par SMS. Fermé : ces formats sont ignorés ; seuls les formats définitifs (code marchand) comptent.', defaultOpen: false },
  { key: 'PAIEMENT_LIGDICASH', label: 'Paiement en ligne Ligdicash', help: 'Ouvert (après le contrat et les identifiants Ligdicash) : le paiement en ligne confirmé par Ligdicash valide seul la commande. Fermé : Ligdicash n’est plus utilisé (les SMS ne sont pas concernés).', defaultOpen: false },
  { key: 'FRAIS_PAR_KM', label: 'Frais par kilomètre avant le paiement', help: 'Ouvert : le Patron règle une grille par kilomètre (prix de départ, prix par km, arrondi, minimum, maximum) ; une fois allumée, le site calcule les frais avec la distance par la route, le client les voit (« Livraison : X F (Y km), à payer au livreur ») et les accepte avant de payer son repas. Sans position, il choisit son quartier ; « Autre quartier » n’est plus proposé ; le call center ne corrige plus les frais (le Patron, toujours avec un motif). Fermé : comme avant.', defaultOpen: false },
  { key: 'SUIVI_SANS_WHATSAPP', label: 'Suivi sans WhatsApp', help: 'Ouvert : le client suit sa commande en direct sur sa page de suivi (lien secret donné à la commande : livreur à appeler, code de livraison, montant à payer au livreur, avis) et reçoit des alertes gratuites sur son téléphone (« en route », « livrée, merci »). Le call center n’a plus de message à confirmer ni de client à remercier. Fermé : comme avant.', defaultOpen: false },
  // Compte Patron simplifié : fermé sans ligne. Ouvert, le Patron n'a plus que 5 onglets (Comptes, Menu, Frais de
  // livraison, Équipe, Avis), reçoit le résumé du soir et de la semaine, et seulement les alertes importantes.
  { key: 'COMPTE_PATRON_SIMPLE', label: 'Compte Patron simplifié', help: 'Ouvert : le compte Patron n’a plus que 5 onglets (Comptes, Menu, Frais de livraison, Équipe, Avis) ; Comptes = ventes des repas, transactions, phrases, carte des clients. Résumé du soir et de la semaine sur son téléphone ; plus d’alerte de commande, seulement les mauvais avis (avec le commentaire) et les plats en rupture depuis longtemps. Commandes, Caisse et Réglages restent gérés par vous. Fermé : le compte Patron comme avant.', defaultOpen: false },
  { key: 'CALL_CENTER_ALLEGE', label: 'Call center allégé', help: 'Ouvert : aucune étape n’attend plus la confirmation d’un message au client (le message reste proposé, sauf le remerciement qui reste demandé) ; « Paiement vérifié » imprime aussi le bon ; le livreur peut valider une livraison sans le code du client, avec un motif obligatoire (signalée en rouge au Responsable livraison et comptée à part dans le relevé). Fermé : comme avant.', defaultOpen: false },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

// Plan 1 : clé de l'interrupteur « Call center allégé »
export const CALL_CENTER_LIGHT = 'CALL_CENTER_ALLEGE';
// Plan 4 : clé de l'interrupteur « Suivi sans WhatsApp »
export const CUSTOMER_TRACKING = 'SUIVI_SANS_WHATSAPP';
// Plan 3 : clé de l'interrupteur « Frais par kilomètre avant le paiement »
export const FEES_BY_KM = 'FRAIS_PAR_KM';
// Plan 2 : clés des interrupteurs « Paiement automatique par SMS », « Formats SMS d'essai » et « Paiement en ligne Ligdicash »
export const AUTO_PAYMENT_SMS = 'PAIEMENT_AUTO_SMS';
export const SMS_TRIAL_FORMATS = 'PAIEMENT_SMS_ESSAI';
export const AUTO_PAYMENT_LIGDICASH = 'PAIEMENT_LIGDICASH';
// Lot « Commande simplifiée » (site client)
export const SIMPLE_ORDER = 'COMMANDE_SIMPLIFIEE';
// Tranches de distance mesurées par la route
export const ROAD_BANDS = 'TRANCHES_PAR_ROUTE';
// Compte Patron simplifié
export const PATRON_SIMPLE = 'COMPTE_PATRON_SIMPLE';

export const FEATURE_CLOSED = 'Fonction non incluse dans votre formule, contactez votre prestataire.';

// Ouverte ou fermée quand elle n'a pas de ligne : ouverte, sauf RELEVE (lot 5d), LIVREURS_INDEPENDANTS, NOUVEAU_VISUEL
// CALL_CENTER_ALLEGE, SUIVI_SANS_WHATSAPP, FRAIS_PAR_KM, PAIEMENT_AUTO_SMS, PAIEMENT_SMS_ESSAI, PAIEMENT_LIGDICASH, COMMANDE_SIMPLIFIEE, TRANCHES_PAR_ROUTE et COMPTE_PATRON_SIMPLE
export const featureDefault = (key) => FEATURES.find((f) => f.key === key)?.defaultOpen ?? true;

// Lignes FeatureSwitch -> { HISTORIQUE: true, … } : une fonction sans ligne garde sa valeur par défaut
export function featureMap(rows = []) {
  const byKey = new Map(rows.filter((r) => typeof r.enabled === 'boolean').map((r) => [r.key, r.enabled]));
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, byKey.has(key) ? byKey.get(key) : featureDefault(key)]));
}

// Historique fermé : les commandes terminées (livrées ou annulées) restent visibles 24 heures
export const HISTORY_HOURS = 24;
export const historyCutoff = (now = new Date()) => new Date(now.getTime() - HISTORY_HOURS * 60 * 60 * 1000);

// Plan 2 : paiement automatique, deux interrupteurs indépendants. sms : les SMS du téléphone marchand sont lus ;
// trial : les formats d'essai comptent aussi (seulement avec sms) ; ligdicash : le paiement en ligne est utilisé ;
// any : l'un des deux (paiement rattaché affiché à l'équipe). Les deux fermés : vérification à la main, comme avant.
export function autoPaymentModes(features) {
  const sms = Boolean(features[AUTO_PAYMENT_SMS]);
  const ligdicash = Boolean(features[AUTO_PAYMENT_LIGDICASH]);
  return { sms, trial: sms && Boolean(features[SMS_TRIAL_FORMATS]), ligdicash, any: sms || ligdicash };
}
