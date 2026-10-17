# Feuille de route · Belchicken Burkina

Chantier en 10 lots, demandé le 8 octobre 2026. Nous sommes prestataires du logiciel.

> **L'application n'est pas encore livrée à Belchicken (9 octobre 2026) : tout est en test**, y compris le site en
> ligne et la base de production. Voir « Avant la livraison à Belchicken » en bas de ce document.

## Règle absolue, pour tout le chantier

- **On ajoute, on ne casse rien.** Le parcours actuel, de la commande à la livraison, doit continuer à fonctionner exactement pareil.
- **Chaque nouveauté s'active par un réglage.** Éteint (par défaut) = fonctionnement actuel.
- **Les tests existants passent toujours** (139 au début du chantier), plus ceux de chaque lot.
- **Dev uniquement** pour le travail et les essais (vérifier le serveur dans `backend/.env` : `ep-nameless-band-b4vetndd`).
- **Schéma Prisma présenté avant** toute modification de base. Les migrations n'écrivent aucune donnée en production, sauf accord.
- **Captures** de chaque lot, puis **STOP avant chaque mise en ligne**.

## Contexte du restaurant (à ne pas changer)

Le call center vérifie les paiements, écrit chaque commande sur une feuille, la caisse la valide, le ticket de caisse
y est attaché, puis la feuille va en cuisine. On ne touche pas à ce circuit : le logiciel l'accompagne.

Le call center reçoit aussi des commandes par appel et par deux WhatsApp : +226 05 23 48 48 et +226 50 62 70 70 (Telmob).
Elles sont payées par mobile money **avant**, comme sur le site.

## Les 10 lots, dans cet ordre

| Lot | Sujet | État |
|-----|-------|------|
| 1 | Parcours court (option) + bon de commande imprimable | En ligne depuis le 8 octobre 2026 (réglage « Parcours court » allumé en production par le client le 9 octobre, gardé allumé) |
| 2 | Prise de commande par l'agent (appel, WhatsApp) | En ligne depuis le 9 octobre 2026 (réglage « Prise de commande par l'agent » éteint en production) |
| 3 | Supplément de nuit dans la grille des frais | En ligne depuis le 9 octobre 2026 (réglage « Supplément de nuit » éteint en production) |
| 4 | Compte Prestataire au-dessus du Patron | En ligne depuis le 10 octobre 2026 (aucun compte Prestataire en production, tout ouvert) |
| 5 | Livraison en deux modes (Restaurant / Prestataire) | Terminé : 5a, 5b, 5c en ligne depuis le 10 octobre 2026, 5d en ligne depuis le 11 octobre 2026 (production en mode Restaurant, réglage « Tournées et disponibilité » éteint, interrupteur `RELEVE` fermé, aucun Responsable livraison ni livreur de notre équipe : rien ne change en production) |
| 6 | Ventes globales, par agent et par provenance, export Excel et PDF | En ligne depuis le 11 octobre 2026 (enregistrement `6c005ce`, aucune migration, interrupteur `VENTES` ouvert : le Patron voit l'onglet « Ventes ») |
| 7 | Avis des clients | Terminé : en ligne le 12 octobre 2026, réglage « Demander l’avis des clients » éteint en production |
| 8 | Langue FR/EN sur le site client | Terminé : en ligne le 12 octobre 2026 (enregistrement `1e2047c`), réglage « Site en anglais » éteint en production |
| 9 | WhatsApp automatique (API Meta), deux numéros | À faire |
| 10 | Application Play Store | À faire |
| 11 | Menu façon borne (page du menu du site client), façon A | En ligne depuis le 12 octobre 2026 (enregistrement `6000564`, réglage éteint ; sauvegarde Neon de production « sauvegarde-prod-avant-lot11-12 » faite avant par le client) : page « écran libre » validée par le client, réglage « Menu façon borne » et interrupteur `MENU_BORNE` (migration groupée `20261012180000_menu_borne_page_commandes`, passée en production, **vérifiée par le client dans le journal de Render**), essais faits ; `/menu-borne` renvoie vers `/menu` |
| 12 | Page Commandes plus lisible (soirs d'affluence) | En ligne depuis le 12 octobre 2026 (`6000564`, réglage allumé par le client), puis barre ⋮ (`f42a20a`) et façon B (`8a5fcc3` : étapes vides cachées, onglet « Tout »), envoyées le 12 octobre 2026 avec l'accord écrit du client, sans migration ; avant : nouvelle page, coup de feu `demo:affluence` écrit dans dev, réglage « Nouvelle page Commandes » et interrupteur `NOUVELLE_PAGE_COMMANDES` (même migration que le lot 11, vérifiée dans Render), essais faits ; `/equipe/commandes-v2` gardée pour le Patron et le Prestataire |

Hors lots : **démonstration commerciale** sur la base dev (scripts `demo:*`, enregistrement local `bcc13e1`, pas
envoyé sur GitHub). Voir « Démonstration commerciale » plus bas.

### 1. Parcours court et bon de commande

- **Parcours court** (réglage, éteint par défaut) : un bouton « Paiement vérifié » fait passer une commande de
  `PAIEMENT_A_VERIFIER` directement à `EN_PREPARATION`, avec **un seul** message au client.
- **Bon de commande imprimable** depuis le navigateur (ticket 80 mm et A4) : référence, heure, provenance, plats,
  formules, boissons, notes, livraison ou à emporter, quartier, téléphone du client. Disponible dans les deux parcours.

Fait, en ligne depuis le 8 octobre 2026 (réglage allumé en production par le client le 9 octobre 2026 pendant ses essais, gardé allumé pour l'instant) : réglage `AppSettings.shortFlow` (page « Réglages » du Patron, `/equipe/reglages`), commande notée
`Order.shortFlow`, deux lignes d'historique (« Payée » puis « En préparation »), messages `PAIEMENT_PREPARATION`
(et sa version « offerte ») et `PAIEMENT_PREPARATION_EMPORTER`. Bon de commande `/equipe/commandes/:reference/bon`
(`?format=80` ou `a4`) avec les prix, « PAYÉ – opérateur » et le numéro qui a payé, les frais à part ; jamais le code
de remise ni le code de retrait. Migration `20261008121039_parcours_court` (structure seulement).

### 2. Prise de commande par l'agent

- « Nouvelle commande » dans l'espace équipe.
- Client retrouvé par son numéro : nom, quartier et repères préremplis.
- Recherche rapide des plats, formules et boissons, comme sur le site.
- Provenance choisie dans une liste réglable : Site, Appel, WhatsApp 05 23 48 48, WhatsApp 50 62 70 70.
- L'agent qui saisit est enregistré. Ensuite, même parcours que le site (paiement mobile money avant).

Fait, en ligne depuis le 9 octobre 2026 (enregistrement `e1a2341`, réglage éteint en production, sauvegarde Neon
`sauvegarde-lot2` faite avant). Migration `20261008184021_prise_de_commande_agent` passée sur Render : structure, et les
4 provenances de départ (Site, Appel, WhatsApp +226 05 23 48 48, WhatsApp +226 50 62 70 70 (Telmob)), créées seulement si
absentes (`ON CONFLICT DO NOTHING`). Vérifié après la mise en ligne, sans rien écrire en production : serveur et site à jour,
menu, paiement, livraison, suivi et validation d'une commande du site comme avant.

**Avancement** :

- [x] Base : table `OrderSource`, `Order.sourceId/sourceName/createdById/createdByName`, `AppSettings.agentOrders`.
  Migration `20261008184021_prise_de_commande_agent` (avec les 4 provenances de départ, accord du 8 octobre),
  passée sur dev seulement.
- [x] Serveur, règles sans base : `order-sources.js` (refus de « Site », numéro WhatsApp d'envoi, saisie par,
  paiement vérifié par, client retrouvé), `createOrder(input, agent)`, alertes équipe, message `COMMANDE_A_PAYER`.
- [x] Fins de ligne remises en LF (9 octobre).
- [x] Adresses du serveur : réglage `agentOrders` (`/api/staff/reglages`), provenances du Patron
  (`/api/staff/provenances`, `staff-sources.routes.js`, `order-sources.service.js`), `GET /api/staff/orders/nouvelle`
  (provenances proposées, jamais « Site »), `GET /api/staff/orders/client?phone=`, `POST /api/staff/orders`
  (refusé si réglage éteint ou provenance « Site »).
- [x] Détail (serveur) : `toStaffOrder` donne `source`, `enteredBy`, `paymentVerified`, `sendFrom` (aussi dans `notice`).
- [x] Pages (9 octobre, compilées) : Nouvelle commande `/equipe/commandes/nouvelle` (`NewOrder.jsx`, panier à part),
  bouton « + Nouvelle commande » (réglage allumé), Réglages (interrupteur + `SourcesBox.jsx`), détail et bon (provenance,
  « Saisie par », « Paiement vérifié par »), « Envoyez depuis WhatsApp +226… » à chaque étape (`SendFrom` dans `OrderSteps.jsx`),
  message facultatif « Envoyer au client » à « À vérifier ».
- [x] Tests `backend/test/agent-orders.test.js`, 13 tests, 156 au total, tous passent (9 octobre) (3 précisions du client : « Site » jamais proposé ni accepté ;
  « Envoyez depuis WhatsApp +226… » sur « Envoyer au client » et toutes les étapes suivantes ; « saisie par » et
  « paiement vérifié par » sur le détail et le bon).
- [x] Essai de bout en bout avec « Awa (essai) », réglage allumé puis éteint (9 octobre, dev) : 19 vérifications sur 19,
  commandes d'essai supprimées, mot de passe d'Awa remis, Patron d'essai supprimé, aucune ligne `AppSettings` laissée.
- [x] Captures (16) dans `C:\Users\HP\Desktop\belchiken\captures-lot2-prise-commande\`.
- [x] Accord du client, enregistrement Git, mise en ligne (9 octobre 2026), réglage éteint en production.

### 3. Supplément de nuit

- Heures de nuit réglées par le Patron ; supplément par quartier et par tranche de distance (0 F par défaut).
- Calculé sur l'heure de la commande, affiché au client (« dont X F de supplément de nuit »), figé dans la commande.

Accord du client sur le plan le 9 octobre 2026, avec 3 précisions : correction des frais d'une commande de nuit = supplément
gardé, ramené au nouveau total s'il le dépasse ; frais « à confirmer » de nuit = rappel à l'agent **et** champ facultatif
« dont supplément de nuit » (au plus le total) ; messages = « (dont X F de supplément de nuit) » dans la valeur du montant,
sans nouveau modèle Meta (phrase unique mise à jour dans CLAUDE.md).

**Avancement** :

- [x] Base : `DeliveryZone.nightFee`, `DeliveryDistanceBand.nightFee` (0 F par défaut), `DeliverySettings.nightEnabled`
  (éteint par défaut), `nightStartMin` (22 h), `nightEndMin` (6 h), `Order.deliveryNightFee`. Migration
  `20261009180805_supplement_nuit` (structure seulement), passée sur dev seulement.
- [x] Serveur : calcul à l'heure de la commande (heure du Burkina), passage à la nuit = `FRAIS_CHANGES`, même règle pour
  l'agent, saisie et correction « dont supplément de nuit » (`nightFeeAfter()`), rappel `nightOrder`, réglages du Patron.
- [x] Messages : « 1 500 F (dont 500 F de supplément de nuit) » dans la valeur du montant, mêmes modèles Meta.
- [x] Pages : Frais de livraison (Patron), Vos informations, Nouvelle commande (agent), détail, bon, livreur, caisse, suivi.
- [x] Tests `backend/test/night-fee.test.js`, 10 tests, 166 au total, tous passent (9 octobre).
- [x] Essai de bout en bout sur dev (9 octobre) : jour, nuit, passage à la nuit pendant la commande (refus puis nouveau
  montant), commande saisie par l'agent, frais à confirmer avec supplément, corrections, livraison en espèces, caisse,
  réglage éteint = comme avant. Commandes, grille, réglages et comptes d'essai supprimés ensuite (dev comme avant l'essai).
- [x] Captures (19 images et 2 messages) dans `C:\Users\HP\Desktop\belchiken\captures-lot3-supplement-nuit\`.
- [x] Accord du client, sauvegarde Neon `sauvegarde-lot3` (faite et vérifiée par le client), enregistrement `79eaccb`,
  mise en ligne le 9 octobre 2026. Migration `20261009180805_supplement_nuit` passée sur Render : colonnes seulement, aucune
  donnée écrite (supplément éteint, 0 F partout). Vérifié après la mise en ligne, sans rien écrire en production : serveur
  et site à jour, menu, paiement, grille des frais sans heures de nuit (réglage éteint), espace équipe protégé.

### 4. Compte Prestataire

- Compte au-dessus du Patron, très protégé.
- Interrupteurs pour ouvrir ou fermer des fonctions (historique, tableau de bord, relevés…). Cacher, jamais supprimer.
- Chaque changement enregistré : qui, quand, quoi.

Accord du client sur le plan le 9 octobre 2026, avec ces réponses : TOTP par une bibliothèque reconnue (`otpauth`), tests avec
les exemples officiels RFC 6238, `qrcode-terminal` et la clé aussi en texte ; compte de production créé plus tard depuis le
terminal de Render (Starter), le lot 4 peut partir avant, sans compte (tout ouvert) ; historique fermé = 24 heures ; frais de
livraison fermés = option (a), seule la page est cachée ; deux niveaux (inclus par le Prestataire, allumé par le Patron) avec des
interrupteurs à part pour `PARCOURS_COURT`, `PRISE_COMMANDE_AGENT`, `SUPPLEMENT_NUIT` ; ligne « Compte Prestataire » visible
sur la page Équipe du Patron, sans action.

**Avancement** :

- [x] Base : rôle `PRESTATAIRE`, `StaffUser.totpSecretEnc/totpLastStep/failedLogins/lockedUntil`, tables `StaffRecoveryCode`,
  `StaffLoginChallenge`, `FeatureSwitch`, `SecurityLog` (modification et suppression refusées par la base). Migration
  `20261009220000_compte_prestataire` écrite sans aucune base, relue par le client, passée sur dev seulement le 10 octobre
  (19 migrations, données d'avant intactes, base identique au schéma).
- [x] Serveur : connexion en deux temps, code de secours, blocage en base, session de 8 heures, mot de passe avec le code,
  interrupteurs (`requireFeature`), historique limité à 24 h, réglages non inclus, journal. Script `npm run equipe:prestataire`
  (créer, téléphone perdu, nouveau mot de passe, débloquer). Clé `PRESTATAIRE_TOTP_KEY` ajoutée dans `backend/.env` (dev) ;
  **à créer sur Render** avant la mise en ligne.
- [x] Pages : connexion (code ou code de secours), page Prestataire (interrupteurs avec confirmation, journal), menus et pages
  fermées (« Fonction non incluse… »), Réglages et Frais (« Non inclus »), historique 24 h, ligne sur la page Équipe, mot de passe.
- [x] Tests `backend/test/prestataire.test.js`, 17 tests (dont les exemples officiels RFC 6238 en SHA-1, SHA-256 et SHA-512),
  183 au total, tous passent (10 octobre).
- [x] Essai de bout en bout sur dev (10 octobre) avec deux comptes d'essai à part, « Presta (essai) » (70 99 00 01) et
  « Patron (essai) » (70 99 00 09), créés avec les vrais scripts ; codes calculés par le script d'essai, jamais affichés :
  84 vérifications par l'API et les scripts, toutes bonnes. Comptes réels jamais utilisés. Toutes les fonctions rouvertes à la fin.
- [x] Captures (19 images) dans `C:\Users\HP\Desktop\belchiken\captures-lot4-prestataire\`.
- [x] Accord du client sur les captures, sauvegarde Neon `sauvegarde-lot4` (faite et vérifiée par le client),
  `PRESTATAIRE_TOTP_KEY` ajoutée sur Render par le client (clé différente de dev), enregistrement `460e887`, mise en ligne le
  10 octobre 2026. Migration `20261009220000_compte_prestataire` passée sur Render : structure seulement, aucune donnée écrite.
  Vérifié après la mise en ligne, sans rien écrire en production : serveur et site à jour, menu (10 catégories, 51 plats),
  paiement, grille des frais (lit déjà la table des interrupteurs), espace équipe protégé, connexion de l'équipe qui répond
  comme avant, nouvelle adresse du code en place.
- [ ] Compte Prestataire de production : plus tard, depuis le terminal de Render (offre Starter). D'ici là, tout est ouvert.

### 5. Livraison en deux modes (réglés par le Prestataire)

- **Mode Restaurant** = aujourd'hui. **Mode Prestataire** = notre équipe de livreurs.
- Rien n'est retiré des étapes de livraison actuelles. Ajouts :
  - étape « Prête pour livraison » ;
  - disponibilité des livreurs (Disponible / En pause / En course) ;
  - rôle « Responsable livraison », qui ne voit jamais les ventes de Belchicken ;
  - codes marchands des frais selon le mode ;
  - heure exacte de chaque étape (preuves) ;
  - relevé par période.
- Penser le code pour plusieurs restaurants plus tard, sans le construire.

Le contrat de livraison avec Belchicken n'est pas encore négocié : ce qui en dépend se règle plus tard par le Prestataire.
Accord du client sur le plan le 10 octobre 2026 (découpage, schéma, API), avec ces réponses :

1. « Prête pour livraison » seulement en mode Prestataire.
2. Tournées et disponibilité des livreurs en mode Restaurant : réglage à part du Patron, éteint par défaut, et
   interrupteur du Prestataire pour l'inclure ou non (comme les autres).
3. Livraisons offertes payées par Belchicken : prix fixe par livraison offerte, réglable dans les conditions.
4. Forfait mensuel : au prorata des jours, indiqué clairement sur le relevé.
5. Relevé visible par le Patron en lecture seule, interrupteur du Prestataire `RELEVE`.
6. Mode Prestataire : le livreur appuie aussi sur « Commande récupérée » ; s'il ne peut pas (téléphone éteint),
   l'agent confirme à sa place avec un motif. Les deux heures (prête, récupérée) sont des preuves.

Mode figé sur chaque commande à sa création (`Order.deliveryOperator`). Quatre sous-lots, mis en ligne séparément :

| Sous-lot | Contenu | État |
|----------|---------|------|
| 5a | Fondations : mode Restaurant / Prestataire, notre société et nos codes (page Prestataire), codes des frais selon le mode de la commande, journal `MOT_DE_PASSE` et `LIVRAISON` | En ligne depuis le 10 octobre 2026 (enregistrement `c8b4b78`), mode Restaurant en production |
| 5b | Disponibilité des livreurs, livreurs du restaurant ou de notre équipe, rôle `RESPONSABLE_LIVRAISON`, caisse séparée | En ligne depuis le 10 octobre 2026 (enregistrement `6ed214d`), réglage éteint, aucun compte de notre équipe en production |
| 5c | « Prête pour livraison », « Commande récupérée », tournées, preuves horaires | En ligne depuis le 10 octobre 2026 (enregistrement `a47b27e`), mode Restaurant et réglage éteint en production |
| 5d | Conditions du contrat (versions datées), relevé par période, PDF et Excel, interrupteur `RELEVE` | En ligne depuis le 11 octobre 2026 (enregistrement `f4f6f12`), interrupteur `RELEVE` fermé, aucune version des conditions en production |

**Avancement 5a** :

- [x] Base : enum `DeliveryOperator`, table `DeliveryCompany` (une ligne, pas de ligne = mode Restaurant),
  `Order.deliveryOperator` (RESTAURANT par défaut), journal `MOT_DE_PASSE` et `LIVRAISON`. Migration
  `20261010120000_livraison_mode_5a` écrite sans aucune base (`prisma migrate diff` entre deux fichiers de schéma).
- [x] Migration relue et acceptée par le client (10 octobre), journal `LIVRAISON` gardé.
- [x] Migration passée sur dev le 10 octobre (`npm run db:deploy`, serveur revérifié juste avant) : 20 migrations, base
  identique au schéma, données d'avant intactes.
- [x] Serveur : règles `delivery-mode.js` (mode Prestataire refusé sans société, nom affiché et 3 codes valides ; codes
  jamais vidés tant que des commandes Prestataire attendent leurs frais ; mode Prestataire incomplet = Restaurant),
  `delivery-mode.service.js`, `GET/PUT /api/staff/prestataire/livraison` (Prestataire seulement), mode noté à la
  création, codes des frais selon le mode dans les messages, la page de suivi et le détail (mêmes modèles Meta),
  journal `LIVRAISON` (une ligne par changement) et `MOT_DE_PASSE` (`POST /api/staff/password`).
- [x] Pages : section « Mode de livraison » de la page Prestataire, badge « Livraison Prestataire » sur le détail,
  phrase « c’est bien le compte de notre partenaire de livraison » pour les frais sur le suivi en mode Prestataire
  (demande du client ; la phrase du paiement des plats, page Vos informations et Infos, reste « compte de Belchicken »). Compilé.
- [x] Tests `backend/test/delivery-mode.test.js`, 13 tests, 196 au total, tous passent (10 octobre).
- [x] Essai de bout en bout sur dev (10 octobre) avec « Presta (essai) » (vraie connexion, codes calculés par le script,
  jamais affichés), « Awa (essai) » et « Patron (essai) » : 33 vérifications sur 33. Mode Restaurant au départ, mode Prestataire
  refusé sans codes (API et page), Patron, Opérateur et visiteur refusés, code mal écrit refusé, société et codes enregistrés,
  commande Restaurant (ECOFOOD) puis passage au mode Prestataire, commande Prestataire (nos codes dans le message, sur le
  suivi et le détail, même modèle Meta), commande à emporter restée Restaurant, codes impossibles à vider (mode actif, puis
  commande Prestataire en cours), retour au mode Restaurant (la commande Prestataire garde nos codes), mot de passe du
  Prestataire changé, journal `LIVRAISON` et `MOT_DE_PASSE`. Badge du détail rendu plus lisible après les captures.
  Dev remise comme avant : commandes, réglage, mot de passe, code et sessions de « Presta (essai) », sessions d'essai.
  Seules restent 16 lignes du journal de sécurité (la base refuse de les effacer, voulu depuis le lot 4).
- [x] Captures (13 images) dans `C:\Users\HP\Desktop\belchiken\captures-lot5a-modes\`.
- [x] Tests : 196, tous passent après l'essai ; site compilé.
- [x] Accord du client sur les captures, sauvegarde Neon `sauvegarde-lot5a` (faite et vérifiée par le client), tests (196)
  et construction relancés, migration relue (aucun `INSERT`, `UPDATE` ni `DELETE`), enregistrement `c8b4b78`, mise en ligne le
  10 octobre 2026. Migration `20261010120000_livraison_mode_5a` passée par Render au déploiement : structure seulement,
  aucune ligne `DeliveryCompany` en production = mode Restaurant, mode Prestataire impossible (nos codes sont vides).
  Vérifié après la mise en ligne, sans rien écrire en production : site Vercel à jour (nouvelle phrase présente dans son code),
  serveur en bonne santé, menu (10 catégories, 51 plats), codes ECOFOOD, grille des frais, suivi, espace équipe protégé
  (401 sans connexion, y compris la nouvelle adresse du mode de livraison), connexion de l'équipe qui répond comme avant.
- [ ] **Non vérifié dans Render** : le client n'a pas pu regarder lui-même le tableau de bord de Render (journal du
  déploiement, migration `20261010120000_livraison_mode_5a` appliquée). La mise en ligne n'a été constatée que de l'extérieur
  (site, serveur, adresses ci-dessus). À regarder dans Render dès que possible.

**Plan 5b** accepté par le client le 10 octobre 2026, avec ces réponses : le Prestataire seul crée le compte du
Responsable livraison ; le Responsable livraison crée, désactive, réactive nos livreurs et leur donne un mot de passe
provisoire (jamais d'autres responsables), chaque action notée au journal (`COMPTE_LIVRAISON`), le Prestataire peut
tout faire ; une commande ne part qu'avec un livreur de son mode ; notre caisse invisible pour le Patron jusqu'au
relevé (5d) ; en 5b, l'agent choisit toujours le livreur ; livreur « En pause » refusé par le serveur.

**Avancement 5b** :

- [x] Schéma : rôle `RESPONSABLE_LIVRAISON`, enum `CourierAvailability`, `StaffUser.courierTeam/availability/availabilityChangedAt`,
  table `CourierAvailabilityChange`, `AppSettings.restaurantDispatch`, `CashRemittance.operator`, journal `COMPTE_LIVRAISON`.
  Migration `20261010180000_livraison_equipes_5b` écrite sans aucune base (`prisma migrate diff` entre deux fichiers de schéma).
- [x] Migration relue et acceptée par le client (10 octobre), passée sur dev (`npm run db:deploy`, serveur revérifié juste
  avant) : 21 migrations, base identique au schéma, données d'avant identiques (tous les livreurs = équipe Restaurant, Disponible).
- [x] Serveur : règles `courier-team.js` (équipes, disponibilité, « En course » calculé, comptes de notre équipe, ce que voit le
  Responsable livraison), `courier-team.service.js`, livreur de la bonne équipe et pas en pause au départ (`courierAssignError`),
  adresses `/api/staff/livraison/*` (Responsable livraison et Prestataire), `PUT /api/staff/courses/disponibilite`,
  `PUT /api/staff/orders/livreurs/:id/disponibilite`, `GET /api/staff/orders/livreurs?reference=`, réglage `restaurantDispatch`
  et interrupteur `TOURNEES_RESTAURANT`, caisse séparée (`feeOperatorError`, `CashRemittance.operator`), frais de notre partenaire
  à part sur le tableau de bord, journal `COMPTE_LIVRAISON`, page Équipe du Patron en lecture seule pour notre équipe.
- [x] Pages : Courses (Disponible / En pause), nouvelle page Livraison (Livreurs, Caisse, Comptes), seule page du Responsable
  livraison, lien « Livraison » du Prestataire, choix du livreur avec l'état et le bouton pause (livreurs du restaurant, réglage
  allumé), Réglages, détail d'une commande Prestataire (frais vérifiés par notre responsable), tableau de bord, journal. Compilé.
- [x] Tests : `courier-team.test.js` (13) et `route-access.test.js` (6, parcourt les 82 adresses de `/api/staff` : le Responsable
  livraison est refusé partout sauf sur les 12 de sa liste), 215 au total, tous passent.
- [x] Essai de bout en bout sur dev (10 octobre), serveur local avec WhatsApp coupé, comptes d'essai à part (« Essai5b … »),
  codes calculés par le script, jamais affichés : 74 vérifications bonnes sur 75 (la seule « ratée » comptait aussi les 6 lignes
  de journal d'un premier passage interrompu par la connexion internet ; 6 lignes par passage, comme prévu). Refus du Responsable
  livraison vérifié aussi en vrai sur les 67 autres adresses (403). Depuis ce PC, chaque requête vers Neon prend ~300 ms : le
  changement « Paiement vérifié » a dépassé le délai de 5 s des transactions ; pour l'essai seulement, serveur lancé avec un délai
  plus long (code du projet non modifié).
- [x] Régions (d'après la configuration, non vérifiées dans les tableaux de bord) : `render.yaml` demande Render en **Ohio
  (us-east-2)** ; la base dev est en **us-east-2** (adresse dans `backend/.env`). L'adresse de la base de production n'est
  pas sur ce PC (seulement sur Render) : même projet Neon, donc normalement même région, à confirmer dans Neon. La région d'un
  service Render se choisit à sa création : à confirmer dans Render (Settings > Region).
- [x] Précaution demandée par le client : délai des transactions Prisma porté de 5 s (valeur par défaut, réglée nulle part) à
  **15 s** pour tout le serveur (`TRANSACTION_TIMEOUT_MS`, `backend/src/lib/prisma.js`). Les deux délais déjà plus longs restent
  (code de secours du Prestataire 20 s, remplissage du menu 5 min). Vérifié sur dev en lecture seule : une transaction de 6 s
  passe, une de 16 s est refusée. Tests : 215, tous passent.
- [x] dev remise comme avant : commandes, comptes, sessions, remises, disponibilités, réglages (`AppSettings` remis à l'identique),
  société de livraison, interrupteur. Seules restent 35 lignes du journal de sécurité (la base refuse de les effacer, voulu).
- [x] Captures (18 images) dans `C:\Users\HP\Desktop\belchiken\captures-lot5b-equipes\`.
- [x] Accord du client sur les captures, sauvegarde Neon `sauvegarde-lot5b` (faite et vérifiée par le client), migration relue
  (seulement `CREATE` et `ALTER` : aucun `INSERT`, `UPDATE` ni `DELETE`, le seul « DELETE » est la règle `ON DELETE SET NULL` du
  lien), inchangée depuis dev (`migrate status` à jour), tests (215) et construction relancés, enregistrement `6ed214d`, mise en
  ligne le 10 octobre 2026. Migration passée par Render au déploiement (la construction la lance avant de démarrer : le nouveau
  serveur n'aurait pas démarré sans elle ; la connexion de l'équipe lit les nouvelles colonnes et répond normalement).
  **Non vérifié dans le tableau de bord de Render** par le client.
  Vérifié après la mise en ligne, sans rien écrire en production : serveur en bonne santé, nouvelle adresse `/api/staff/livraison`
  en place (401 sans connexion, aussi par le site Vercel), menu (10 catégories, 51 plats), codes ECOFOOD (Orange, Moov, Telecel),
  grille des frais, suivi, espace équipe protégé (401 sans connexion sur commandes, caisse, tableau de bord, livraison, courses,
  réglages, Prestataire), connexion de l'équipe qui répond comme avant, site Vercel à jour (nouvelles pages dans son code).
  En production : réglage « Tournées et disponibilité » éteint, aucun Responsable livraison ni livreur de notre équipe, mode
  Restaurant : tout fonctionne comme avant.

**Avancement 5c** :

- [x] Schéma : statut `PRETE_LIVRAISON` (mode Prestataire seulement), table `DeliveryRun` (tournées), `Order.deliveryRunId`,
  événements `RECUPEREE_SANS_LIVREUR` et `LIVREUR_RETIRE`. Preuves : la base refuse toute modification de l'historique des
  commandes (`OrderStatusChange`, `OrderEvent`) ; seule exception, le lien `staffUserId` vidé à la suppression d'un compte (seule
  clé `ON DELETE SET NULL` de ces deux tables, l'autre, `orderId`, est en `CASCADE`) ; suppressions toujours possibles.
  Migration `20261010200000_livraison_tournees_5c` écrite sans base, passée sur dev (même fichier, empreinte identique).
  `npm run test:db` (dev seulement) : modification refusée, lien vidé, suppression en cascade, sur les deux tables : passe.
- [x] Serveur : règles `dispatch.js`, `dispatch.service.js`. Mode Prestataire : le Responsable livraison confie une ou plusieurs
  commandes (tournée, 10 au plus) dès « En préparation », change ou retire le livreur avant la récupération, le remplace pendant
  la livraison ; l'équipe du restaurant pose « Prête pour livraison » (sans message au client) ; le livreur appuie sur
  « Commande récupérée » (code de remise créé à ce moment), ou l'agent / le Responsable à sa place avec un motif. L'agent ne fait
  plus partir ni ne change le livreur d'une commande Prestataire. Mode Restaurant avec le réglage « Tournées et disponibilité » :
  tournée de l'agent, tout ou rien, chaque commande avec son code, ses frais et son message « en route ». Le client voit toujours
  « En préparation » jusqu'à « En route » (page de suivi). Heures de chaque étape (preuves) pour l'équipe et le Responsable.
  Alertes : Responsable livraison (commande à attribuer, commande prête), livreur (course prête, course retirée).
- [x] Pages : Commandes (« Prête » rangée avec « En préparation », tournée du restaurant au-dessus des colonnes), détail (Prête
  pour livraison, récupérée sans le livreur, heures), Livraison (À attribuer, À récupérer, En cours, Livrées aujourd'hui),
  Mes courses (À récupérer, « Commande récupérée »). Compilé.
- [x] Tests : 232, tous passent (`dispatch.test.js`, `order-history-rule.test.js`, `route-access.test.js` mis à jour).
- [x] Essai de bout en bout sur dev (10 octobre), serveur local avec WhatsApp et alertes coupés, comptes d'essai à part
  (« Essai5c … ») créés par le script : 54 vérifications sur 54. Dev remise comme avant : commandes, tournées, disponibilités,
  comptes, société de livraison, réglages (à l'identique) ; journal de sécurité inchangé (140 lignes).
- [x] Captures (13 images) dans `C:\Users\HP\Desktop\belchiken\captures-lot5c-tournees\`.
- [x] Accord du client sur les captures, sauvegarde Neon `sauvegarde-lot5c` (faite et vérifiée par le client), tests (232) et
  construction relancés, migration relue (seulement `CREATE` et `ALTER` : aucun `INSERT`, `UPDATE` ni `DELETE` ; les mots
  « UPDATE » et « DELETE » du fichier sont les règles des liens et la règle qui refuse les modifications), inchangée depuis dev
  (même empreinte), enregistrement `a47b27e`, mise en ligne le 10 octobre 2026. Migration passée par Render au déploiement.
  **Non vérifié dans le tableau de bord de Render** : les nouvelles adresses sont toutes derrière la connexion de l'équipe, la
  bascule sur la nouvelle version n'est donc pas visible de l'extérieur. Site Vercel à jour (nouvelles pages dans son code).
  Vérifié après la mise en ligne, sans rien écrire en production : serveur en bonne santé pendant tout le déploiement, menu
  (10 catégories, 51 plats), codes ECOFOOD, grille des frais, accueil, suivi, connexion de l'équipe qui répond comme avant,
  espace équipe protégé (401 sans connexion, y compris les nouvelles adresses : tournées, « Commande récupérée »).
  En production : mode Restaurant (aucune société de livraison), réglage « Tournées et disponibilité » éteint, aucun Responsable
  livraison ni livreur de notre équipe : tout fonctionne comme avant.

**Plan 5d** accepté par le client le 10 octobre 2026 (plan, schéma, API), avec ces réponses : livraison offerte avec la
formule « Prix par livraison » = Belchicken paie les deux, en deux lignes séparées et expliquées ; date d'effet d'une
version aujourd'hui ou plus tard seulement (un relevé remis ne change jamais) ; Excel en vrai `.xlsx` avec `exceljs` ;
livraison comptée à sa date de livraison. Modification du client : le Responsable livraison voit le relevé de son
travail (livraisons, frais encaissés, délais, livreurs, tournées, annulations) mais **jamais** les conditions du contrat
ni le montant dû (page, PDF, Excel ; vérifié par le serveur et par un test). Le Prestataire voit tout ; le Patron voit
tout si l'interrupteur `RELEVE` est ouvert (fermé par défaut, ne cache le relevé qu'au Patron).

**Avancement 5d** :

- [x] Schéma : enum `ContractKind`, table `DeliveryContractTerms` (versions datées, modification refusée par la base),
  journal `CONTRAT`, index `OrderStatusChange(toStatus, createdAt)`. Migration `20261010220000_releve_5d` écrite sans
  aucune base (`prisma migrate diff` entre deux fichiers de schéma).
- [x] Migration relue et acceptée par le client (10 octobre), passée sur dev (`npm run db:deploy`, serveur revérifié juste
  avant) : 23 migrations, base identique au schéma (vérifié en lecture seule), mêmes nombres de lignes qu'avant.
- [x] Serveur : `statement.js` (période, conditions, montant dû jour par jour, relevé, `forViewer()`), `statement.service.js`
  (ne lit jamais les ventes ; conditions jamais lues pour le Responsable livraison), `statement-excel.js` (`exceljs`),
  adresses `/api/staff/releve`, `/excel`, `/conditions`, interrupteur `RELEVE` (fermé sans ligne, Patron seulement :
  `featureDefault()` dans `features.js`), journal `CONTRAT`.
- [x] Pages : section « Contrat avec Belchicken » de la page Prestataire (versions, nouvelle version avec confirmation,
  suppression d'une version future), onglet « Relevé » de la page Livraison (Prestataire, Responsable livraison), page
  `/equipe/releve` et lien « Relevé » du Patron (`RELEVE` ouvert ; fermé : « Fonction non incluse »), page A4 à imprimer
  en PDF, bouton « Télécharger Excel ». En-tête un peu resserré entre 1025 et 1440 px (le lien « Relevé » du Patron tient ;
  corrige aussi en partie le débordement de l'en-tête du Prestataire, qui existait avant 5d). Compilé.
- [x] Tests : `statement.test.js` (16 tests, dont le Responsable livraison qui ne reçoit jamais les conditions ni le montant
  dû, page et Excel), `route-access.test.js` (relevé ouvert au Responsable, conditions jamais), `prestataire.test.js`
  (`RELEVE` fermé sans ligne). 248 au total, tous passent.
- [x] Essai de bout en bout sur dev (10 octobre), serveur local avec WhatsApp et alertes coupés, comptes d'essai à part
  (« Essai5d … ») créés par le script, codes calculés par le script, jamais affichés : historique antidaté du 1er au
  9 octobre (33 livraisons, 2 annulations, 3 tournées, 1 version des conditions antidatée, seulement pour l'essai) et
  4 vraies commandes du jour par l'API (paiement vérifié avec les frais, tournée du Responsable, prête, récupérée par le
  livreur ou par l'agent avec motif, livrée avec le code, espèces et mobile money, une annulée) : 54 vérifications bonnes,
  plus le contrôle « aucune donnée de vente ni du client » (sa 1re version cherchait le nombre 6500 et tombait par hasard
  sur des montants de frais : remplacée par un contrôle exact des champs). Montant dû recalculé à part : identique.
  Excel relu par `exceljs` et par Python (archives et XML valides) ; Microsoft Excel n'est pas installé sur ce PC :
  fichiers à ouvrir par le client. Dev remise comme avant (comptes, commandes, tournées, remises, conditions,
  interrupteur, société de livraison, sessions : identiques à l'instantané d'avant l'essai) ; seules restent 33 lignes du
  journal de sécurité (173 au lieu de 140, la base refuse de les effacer).
- [x] Captures (12 images, 2 PDF, 3 fichiers Excel) dans `C:\Users\HP\Desktop\belchiken\captures-lot5d-releve\`.
- [x] Accord du client sur les captures, le PDF et les fichiers Excel (11 octobre), sauvegarde Neon `sauvegarde-lot5d`
  (faite et vérifiée par le client), tests (248) et construction relancés, migration relue (seulement `CREATE` et `ALTER` :
  aucun `INSERT`, `UPDATE` ni `DELETE` ; le mot « UPDATE » du fichier est la règle qui refuse les modifications), inchangée
  depuis dev (même empreinte que celle enregistrée sur dev), enregistrement `f4f6f12`, mise en ligne le 11 octobre 2026.
  Migration passée par Render au déploiement (**non vérifié dans le tableau de bord de Render** ; la nouvelle adresse du
  relevé répond 401 au lieu de 404, la nouvelle version tourne donc). Site Vercel à jour.
  Vérifié après la mise en ligne, sans rien écrire en production : serveur en bonne santé, menu (10 catégories, 51 plats),
  codes ECOFOOD et menu identiques octet pour octet à avant la mise en ligne, connexion de l'équipe qui répond comme avant,
  espace équipe protégé (401 sans connexion, y compris relevé, Excel et conditions), pages du site (accueil, menu, infos,
  espace équipe) en ligne. En production : interrupteur `RELEVE` fermé (pas de ligne), aucune version des conditions,
  aucun compte Prestataire ni Responsable livraison : tout fonctionne comme avant.

**Lot 5 terminé le 11 octobre 2026.**

**À faire plus tard** (noté par le client le 11 octobre 2026, après 5d) :

- [ ] En-tête de l'espace équipe du **Prestataire** : déborde sur téléphone.
- [ ] En-tête de l'espace équipe du **Patron** : déborde sur tablette (moins de 1024 px).

### 6. Ventes

- Ventes globales, par agent et par provenance, avec le mode de paiement, par période.
- Export Excel et PDF.

Plan accepté par le client le 11 octobre 2026 (aucun schéma, aucune migration), avec ces réponses : frais de
livraison du restaurant affichés à part (« hors ventes »), ceux de notre partenaire jamais ; onglet « Ventes » dans
la page Tableau de bord plutôt qu'un lien de plus dans l'en-tête ; Excel sans nom ni téléphone du client ; délai de
vérification sur toutes les commandes et sur celles du site seules. Interrupteur `VENTES` ouvert par défaut.

**Avancement** :

- [x] Serveur : `sales.js` (règles), `sales.service.js` (lecture seule), `sales-excel.js` (`exceljs`), adresses
  `GET /api/staff/ventes` et `/ventes/excel` (Patron et Prestataire, `requireFeature('VENTES')`), interrupteur `VENTES`.
  `feeCounted` du tableau de bord exporté (même règle des frais). Rien d'autre ne change.
- [x] Pages : `frontend/src/staff/sales/` (page, vue, page A4), onglets `ChiffresTabs.jsx` (Tableau de bord / Ventes),
  lien « Tableau de bord » de l'en-tête vers les ventes si seul `VENTES` est ouvert. Compilé.
- [x] Tests : `sales.test.js` (11) et `route-access.test.js` (ventes refusées à l'Opérateur, au Livreur et au
  Responsable livraison), 260 au total, tous passent.
- [x] Essai de bout en bout sur dev (11 octobre), serveur local avec WhatsApp et alertes coupés, comptes d'essai à
  part (« Essai6 … », Prestataire compris, codes calculés par le script, jamais affichés) : 9 commandes du jour par
  l'API (site et agent, 4 provenances dont une nouvelle, vérifiées par 3 personnes, parcours court, 2 annulées, 1 à
  vérifier, frais du restaurant et du partenaire) et 6 commandes antidatées : 86 vérifications sur 86 (chiffres
  recalculés à part depuis la base pour 5 périodes, agents, délais, provenances, Excel, accès des 5 rôles, interrupteur
  fermé). Dev remise comme avant (commandes, provenances, comptes, réglages, interrupteurs identiques à l'instantané) ;
  seules restent 7 lignes du journal de sécurité (180 au lieu de 173, la base refuse de les effacer).
- [x] Captures (12 images, 1 PDF, 1 fichier Excel) dans `C:\Users\HP\Desktop\belchiken\captures-lot6-ventes\`.
- [x] Accord du client sur les captures, le PDF et l'Excel (11 octobre), pas de sauvegarde Neon (aucune migration,
  accord du client), tests (260) et construction relancés, enregistrement `6c005ce`, mise en ligne le 11 octobre 2026.
  Vérifié après la mise en ligne, sans rien écrire en production : la nouvelle adresse `/api/staff/ventes` répond 401
  (connexion demandée) au lieu de 404, aussi par le site Vercel et pour l'Excel ; santé, menu (10 catégories, 51 plats),
  codes ECOFOOD (Orange, Moov, Telecel), grille des frais et photos de l'accueil identiques octet pour octet à avant la
  mise en ligne ; espace équipe protégé (401 sans connexion : commandes, caisse, tableau de bord, relevé, Prestataire,
  livraison) ; connexion de l'équipe qui répond comme avant ; pages du site en ligne ; site Vercel à jour (nouvelle page
  dans son code). Pas de migration : rien à vérifier dans le tableau de bord de Render.
  En production : aucune ligne `VENTES` = ouvert, le Patron voit l'onglet « Ventes » de la page Tableau de bord.

**Lot 6 terminé le 11 octobre 2026.**

### 7. Avis des clients

- Lien dans le message de remerciement.
- Notes par étoiles (call center, restaurant, livraison) et commentaire.
- Moyennes par agent et par livreur ; alerte au Patron en cas de mauvaise note.

Plan, schéma et API acceptés par le client le 11 octobre 2026, avec ces réponses : deux niveaux (interrupteur `AVIS`
ouvert par défaut + réglage du Patron « Demander l'avis des clients », éteint par défaut) ; mauvaise note = 2 étoiles
ou moins sur l’une des trois ; lien valable 7 jours ; alertes au Patron et au Prestataire, au Responsable livraison
seulement pour une mauvaise note de livraison de notre équipe ; agents et livreurs ne voient pas leurs notes. Modèles
Meta des clients pas encore soumis : rien à casser chez Meta ; deux modèles en plus (`commande_livree_avis`,
`emporter_commande_retiree_avis`), les anciens inchangés. Rappel strict (demande du client) : une seule fois, note
non modifiable ; la base laisse passer seulement le rappel et le lien vidé à la suppression d’un compte.

**Avancement** :

- [x] Règles `review.js` et tests `review.test.js` (13), messages « avis » et tests (3), interrupteur `AVIS`.
- [x] Schéma : `Order.reviewToken` (unique), table `OrderReview` (notes vérifiées par la base, modification refusée
  sauf le rappel une fois et le lien vidé), `AppSettings.reviewsEnabled`. Migration `20261011120000_avis_clients`
  écrite sans aucune base (`prisma migrate diff` entre deux fichiers de schéma), relue et acceptée par le client.
- [x] Migration passée sur dev le 11 octobre (`npm run db:deploy`, serveur revérifié juste avant) : 24 migrations, base
  identique au schéma (vérifié en lecture seule), mêmes lignes qu’avant, aucune commande avec une clé. `npm run test:db`
  (dev seulement) : 2 essais, passent (notes, un seul avis, 9 modifications refusées, rappel une seule fois, lien vidé
  à la suppression du compte, avis supprimé avec la commande), rien laissé derrière.
- [x] Serveur : clé créée au passage « Livrée » (agent ou livreur), `review.service.js`, adresses publiques
  `/api/avis/:cle` et équipe `/api/staff/avis`, `/api/staff/livraison/avis`, alertes de mauvais avis, réglage du
  Patron. `route-access.test.js` lit aussi les interrupteurs de chaque adresse. 278 tests, tous passent.
- [x] Pages : avis public `/avis/:cle` (fichier à part de 5 Ko, sans le menu), onglet « Avis » du Patron, encadré
  « Avis du client » du détail, onglet « Avis » de la page Livraison, réglage du Patron. Compilé.
- [x] Essai de bout en bout sur dev (11 octobre), serveur local avec WhatsApp et alertes coupés, comptes d’essai à part
  (« Essai7 … », Prestataire compris, codes calculés par le script, jamais affichés) : 9 commandes (livraison
  restaurant, à emporter, mode Prestataire avec notre livreur, réglage éteint puis rallumé, une commande antidatée de
  8 jours écrite directement pour le lien expiré) : **90 vérifications sur 90**. Deux lectures du détail d’une
  commande ont échoué une fois sans cause trouvée (serveur relancé ensuite, plus aucun raté) : l’essai a été repris
  au même endroit avec les mêmes comptes. Dev remise comme avant : 28 tables sur 29 identiques à l’instantané ; seules
  restent 11 lignes du journal de sécurité (191 au lieu de 180, la base refuse de les effacer).
- [x] Captures (16 images) dans `C:\Users\HP\Desktop\belchiken\captures-lot7-avis\`.
- [x] Cause des deux lectures ratées trouvée le 12 octobre (en lecture seule, journal du serveur local) : Neon a coupé
  une connexion restée ouverte (`P1017` « Server has closed the connection »), une fois dans la grille des frais
  (`deliveryZone.findMany`) et une fois dans la vérification de session (`staffSession.findUnique`). Aucun lien avec le
  lot 7 : la lecture du détail (`getOrder`) n’a pas changé, l’avis est lu par une requête à part dont l’échec ne
  bloque jamais le détail. `P1017` n’est pas dans les codes réessayés par `db-retry.js` ; le détail se recharge tout
  seul toutes les 5 s. Piste proposée, à faire plus tard et à part : réessayer `P1017` pour les lectures seulement.
- [x] Réessai des lectures après `P1017` (12 octobre, à part du lot 7, aucune migration) : une lecture (`READ_OPERATIONS`)
  est réessayée tout de suite, 10 fois au plus ; jamais un enregistrement ni une requête écrite à la main. 283 tests.
  Essais sur dev, en lecture seule : (1) trois pauses de 7 min sans activité, avec et sans durée de vie de 1 min des
  connexions inutilisées (`max_idle_connection_lifetime=60`) : aucune coupure dans les deux cas, la mise en veille seule
  ne la provoque pas ici ; la durée de vie de 1 min n'a donc rien montré et **n'est pas ajoutée**. (2) Relais local coupé
  entre deux lectures : même erreur `P1017` que pendant l'essai du lot 7 ; avec 5 connexions coupées, un seul réessai ne
  suffisait pas (d'où 10), la lecture réussit au 6e essai, 3 tours sur 3 ; une requête écrite à la main (`SELECT 1`)
  n'est pas réessayée. Pas encore enregistré ni mis en ligne.
- [x] Accord du client sur les captures (12 octobre), sauvegarde Neon `sauvegarde-lot7` (faite et vérifiée par le
  client), tests (278) et construction relancés, migration relue (aucune donnée écrite, `reviewsEnabled` éteint par
  défaut).
- [x] Enregistrement `2b2ddba`, mise en ligne le 12 octobre 2026 (Render à jour en ~1 min). Vérifié après la mise en
  ligne, sans rien écrire en production : `/api/staff/avis`, `/api/staff/avis/commande/…` et
  `/api/staff/livraison/avis` répondent 401 (connexion demandée) au lieu de 404, aussi par le site Vercel ; un lien
  d’avis inconnu répond « Ce lien d’avis n’existe pas » (la colonne de la migration existe donc en production) ; santé,
  menu, codes ECOFOOD et accueil identiques octet pour octet à avant ; espace équipe protégé (401) ; site Vercel à jour
  (page `/avis/…` dans son code). Migration non vérifiée dans le tableau de bord de Render.
  En production : réglage « Demander l’avis des clients » **éteint** (valeur par défaut de la migration), aucune ligne
  `AVIS` = ouvert. Rien ne change pour les clients tant que le Patron n’allume pas le réglage.

**Lot 7 terminé le 12 octobre 2026.**

### 8. Langue FR/EN

- Sur le site client, français par défaut.

Décisions du client (12 octobre 2026) : seul le site client passe en anglais (espace équipe en français) ; messages
WhatsApp en français (aucun nouveau modèle Meta) ; noms et descriptions des plats, catégories et boissons tels qu'en
base ; tout le reste du site client traduit, y compris les erreurs du serveur (d'après leur code) ; français par
défaut, bouton FR / EN bien visible, choix retenu. **Pas d'anglais automatique** selon la langue du téléphone.
**Langue notée sur la commande**, avec la mention « Client anglophone » dans le détail de la commande.

Fait sur dev (voir README « Langue du site client, FR/EN ») :

- [x] Migration `20261012120000_langue_site` écrite sans base, relue par le client, appliquée sur dev avec son accord
  (`db:deploy`) ; données d'avant vérifiées intactes en lecture seule (empreinte de chaque table).
- [x] Réglage du Patron « Site en anglais » (`AppSettings.englishSite`, éteint) et interrupteur `ANGLAIS` (ouvert sans
  ligne) ; `GET /api/site` ; `Order.language` et pastille « Client anglophone ».
- [x] Textes `frontend/src/i18n/fr.js` et `en.js`, contrôle `npm run langues`. Tests : 288 (283 + 5).
- [x] Captures FR AVANT / APRÈS (réglage éteint) : 14 pages sur téléphone, texte et pixels identiques.
- [x] Essai complet sur dev en anglais : commande livrée (paiement, frais, en route, livrée, avis), commande à emporter
  (prête, retirée), commande française annulée, erreurs du serveur traduites (`erreurs-serveur-fr-en.txt`). Dev remis
  dans son état d'avant (commandes et session d'essai supprimées, réglages remis ; chaque table identique à avant).
- [x] Captures (39 fichiers) dans `C:\Users\HP\Desktop\belchiken\captures-lot8-langue\`.
- [x] Accord du client sur les captures (12 octobre), sauvegarde Neon `sauvegarde-lot8` (faite et vérifiée par le
  client), tests (288), `npm run langues` et construction relancés.
- [x] Enregistrement `1e2047c`, mise en ligne le 12 octobre 2026 (Render à jour en ~1 min). Vérifié après la mise en
  ligne, sans rien écrire en production : `GET /api/site` répond `{"anglais":false}` (404 avant : la colonne
  `englishSite` de la migration existe donc en production) ; santé, menu, codes ECOFOOD, accueil et grille des frais
  identiques octet pour octet à avant ; commande ou lien d’avis inconnus répondent comme avant ; espace équipe protégé
  (401, aussi par le site Vercel) ; site Vercel à jour (code du lot 8) et affiché en français **sans bouton FR / EN**,
  même avec « anglais » mémorisé dans le téléphone. Migration non vérifiée dans le tableau de bord de Render.
  En production : réglage « Site en anglais » **éteint** (valeur par défaut de la migration), aucune ligne `ANGLAIS` =
  ouvert. Rien ne change pour les clients tant que le Patron n’allume pas le réglage.

**Lot 8 terminé le 12 octobre 2026.**

### 9. WhatsApp automatique

- API Meta, une fois tous les messages définitifs, pour les deux numéros.

### 10. Application Play Store

### 11. Menu façon borne (en cours)

Demandé le 12 octobre 2026 par les financeurs : que la **page du menu** du site client ressemble aux bornes de commande
de Belchicken (3 captures envoyées par le client, à joindre au dossier du lot). **Seule la page du menu change** : panier,
validation, paiement, suivi et espace équipe ne bougent pas.

Décision du client : **façon A**, sans toucher à la base pour les suppléments. Les sauces, frites et accompagnements
sont les plats des Extras (et les boissons), ajoutés au panier **en lignes à part**, comme les « boissons en plus »
d'aujourd'hui ; prix toujours ceux du serveur, aucun prix inventé. La **façon B** (vrais suppléments attachés au plat :
groupes de suppléments, prix calculé par le serveur, affichage partout, page du Patron, migration) viendra plus tard,
en lot séparé, seulement si Belchicken la demande.

Ce que fait la page, version **« écran libre »** validée par le client le 12 octobre 2026 (après deux corrections) :

- **écran libre** comme sur une borne : barre fine en haut (petit logo vers l'accueil, loupe, FR / EN si le site en
  anglais est allumé, « Ma commande (n) »), **sans** l'en-tête ni le pied de page du site ; barre fine du panier en bas,
  seulement quand le panier n'est pas vide ;
- **une seule catégorie à la fois** (`/menu-borne/:categorie`, la première par défaut) : on n'en change qu'en touchant
  la colonne de gauche (tablette, ordinateur) ou la bande du haut (téléphone), la catégorie choisie reste en
  surbrillance et la page remonte en haut ;
- dans la catégorie, une rangée par sous-groupe : elle **remplit la largeur** si tous ses plats tiennent (cartes posées
  en largeur s'il y en a 1 ou 2), sinon elle **glisse** horizontalement (flèches ‹ › sur ordinateur) ;
- petites cartes (photo de 100 à 140 px) : au moins **deux rangées entières** visibles sans défiler, sur téléphone,
  tablette et ordinateur ;
- recherche par une petite loupe : seul cas où les catégories se mélangent, sous « N résultats pour … » ;
- écran de personnalisation plein écran sur téléphone, grand panneau ailleurs : formule, choix (cuisson…), boisson
  comprise, puis Sauces, Frites, Boissons en plus, Accompagnements, Poulet à la pièce (sous-groupes des Extras de la
  base, section cachée s'il n'y a rien de disponible), boutons + et −, prix mis à jour à chaque choix, Retour et
  « Ajouter · prix » toujours visibles ; textes en français et en anglais.

Fichiers (à part, rien d'autre ne change) : `frontend/src/pages/MenuBorne.jsx`, `frontend/src/components/borne/`
(`BorneBars`, `BorneCategories`, `BorneRow`, `BorneCard`, `BorneDialog`), `frontend/src/borne.css`,
`frontend/src/utils/borne.js` et ses tests (`npm test` dans `frontend/`) ; adresse d'essai `/menu-borne` dans `App.jsx`,
hors du cadre du site (`Layout.jsx`), sans lien depuis le site ; textes `borne` dans `i18n/fr.js` et `en.js`.
`Menu.jsx`, `ProductDialog.jsx`, `ProductCard.jsx`, `Layout.jsx`, `OrderBar.jsx`, `styles.css`, panier et serveur
inchangés. Captures des bornes : `docs/captures-borne/` ; captures des essais (v1, v2, v3) :
`C:\Users\HP\Desktop\belchiken\captures-lot11-menu-borne\`.

**Décision du client (12 octobre 2026) pour l'étape 1 : un seul interrupteur choisit le menu que voient les clients.**

- **Éteint** (par défaut) : le menu actuel du site officiel, `/menu` avec `Menu.jsx` inchangé.
- **Allumé** : le nouveau menu plein écran façon borne (version « écran libre » ci-dessus), à la place du menu actuel.
- Réglage du Patron **« Menu façon borne »** dans Réglages (`/equipe/reglages`), éteint par défaut, plus
  l'interrupteur du Prestataire **`MENU_BORNE`** (ouvert sans ligne), comme pour le site en anglais ; lu par le site
  avec `GET /api/site`. Pas de version du menu façon borne avec l'en-tête du site.
- **Petite migration** (une colonne de `AppSettings`) : schéma présenté avant, écrite sans base, **sauvegarde Neon
  avant la mise en ligne**, appliquée seulement avec l'accord du client.
- **Ne rien mettre en ligne avant l'étape 1** : sans l'interrupteur, l'adresse d'essai `/menu-borne` serait publique.

Étapes :

- [x] 0. Captures des bornes au dossier (`docs/captures-borne/`, 3 images) ; Extras proposés d'après les sous-groupes
  de la catégorie Extras de la base, prix lus dans le menu. Sur dev, la seule sauce (« Sauce supplémentaire ») est
  indisponible : la section Sauces apparaîtra quand le Patron créera les vraies sauces (noms et prix de Belchicken).
- [x] 1. Réglage « Menu façon borne » et interrupteur `MENU_BORNE`, `GET /api/site` (`menuBorne`), `/menu` qui
  affiche l'un ou l'autre menu (12 octobre 2026). Voir « Réglages des lots 11 et 12 » plus bas.
- [x] 2. Nouvelle page, version « écran libre » (12 octobre 2026, adresse d'essai `/menu-borne`).
- [x] 3. Écran de personnalisation plein écran (façon A), Retour et prix toujours visibles.
- [x] 4. Essais sur dev en tailles téléphone, tablette et ordinateur (navigateur Edge sans fenêtre, aucune erreur, aucune
  commande validée), mesures (une seule catégorie, deux rangées entières, plus de vide à droite, barres fines), 21
  captures v3. Mis en ligne le 12 octobre 2026 avec l’étape 1 (`6000564`).

### 12. Page Commandes plus lisible

Demandé le 12 octobre 2026 : un vendredi soir avec 30 commandes en cours, les agents doivent s'y retrouver d'un coup
d'œil. Page `/equipe/commandes` (Patron, Opérateurs, Prestataire ; le Responsable livraison et les livreurs ont leurs
propres pages). Problèmes relevés par le client : textes d'explication qui prennent la moitié de chaque colonne, six
colonnes dont certaines presque toujours vides (« Payées » avec le parcours court, « À retirer »), cartes trop
grandes, rien ne signale une commande qui attend depuis longtemps.

Proposé (à valider par le client) :

- **explications repliées** derrière un bouton « ? » en tête de colonne (ouvertes au premier passage sur l'appareil) ;
- **colonnes vides réduites** à une bande étroite (nom et 0), qui s'élargit dès qu'une commande arrive ; « Payées »
  cachée quand le parcours court est allumé et qu'elle est vide ;
- **cartes compactes sur 2 lignes** : référence, client, badges (Nouvelle, À emporter, Prête) et **temps d'attente** ;
  puis quartier ou livreur, total et paiement ;
- **couleur selon le temps passé à l'étape** (et non depuis la commande) : normal, orange, rouge, avec des seuils par
  étape à valider (proposés : À vérifier 5 / 10 min, En préparation 25 / 40, Prête pour livraison 10 / 20, En livraison
  40 / 60, À retirer 30 / 60, À remercier 30 / 120) ; **plus anciennes à l'étape en haut** ;
- signe **« message à confirmer »** sur la carte quand l'étape suivante est bloquée par le message au client ;
- bandeau en haut : « 28 en cours · 4 en retard », avec un filtre « En retard seulement » ;
- vue par rôle : pas maintenant (les rôles qui livrent ont déjà leurs pages) ; à revoir après essai.

Sans rien casser :

- réglage du Patron **« Nouvelle page Commandes »**, éteint par défaut (éteint : page actuelle identique) ;
- **petite migration** (une colonne de `AppSettings`), à grouper si possible avec celle du lot 11 pour une seule
  sauvegarde Neon ; annoncée avant, accord du client ;
- **API complétée, sans rien retirer** (signalé) : deux champs de plus par commande dans la liste des commandes en cours,
  `stageSince` (début de l'étape) et `noticePending` (message à confirmer), calculés par les règles existantes
  (`stepStart()`, `noticeState()` de `customer-messages.js`) ; la page actuelle les ignore ;
- nouvelle page dans des fichiers à part ; `OrdersList.jsx`, le détail d'une commande, les boutons d'étape et les
  règles du serveur ne changent pas.

Essai sur dev seulement, avec des données « Démo » : script `demo:affluence` qui ajoute environ 30 commandes en cours
(vendredi soir, toutes les étapes, attentes courtes et longues, livraison restaurant et Prestataire, à emporter),
marquées comme la démonstration (références `BC-0…`, clients « (Démo) ») et donc effacées par `demo:effacer` ; même
garde-fou dev, mêmes prix du serveur, rejouées avec les règles de l'équipe ; écriture dans dev seulement avec l'accord du
client. Captures en tailles téléphone, tablette et ordinateur.

Décisions du client (12 octobre 2026) : seuils proposés acceptés pour démarrer, **modifiables plus tard par le Patron**
(pas maintenant : ils sont réunis dans `frontend/src/staff/orders2/waiting.js` pour cela) ; pas de vue par rôle ;
même méthode que le lot 11 : la nouvelle page d'abord à une **adresse d'essai** `/equipe/commandes-v2`, sans lien,
sans migration ; le réglage « Nouvelle page Commandes » et sa migration viendront après, **groupés avec ceux du lot 11**
(une seule migration, une seule sauvegarde Neon, avec l'accord du client).

Fichiers : serveur `customer-messages.js` (`stageSince()`, `noticePending()`) et `staff-orders.service.js` (liste des
commandes : deux champs ajoutés, rien de retiré), tests `test/orders-board.test.js` ; site `frontend/src/staff/orders2/`
(`OrdersPage2.jsx`, `OrderCard2.jsx`, `waiting.js` et ses tests, `orders2.css`), adresse d'essai dans `StaffApp.jsx`.
`OrdersList.jsx`, `labels.js`, `OrderDetail.jsx` et `staff.css` inchangés. Le détail d'une commande ouvert depuis la
page d'essai ramène à la page actuelle (« ‹ Commandes »), comme avant.

Étapes :

- [x] 0. Accord du client sur l'analyse et sur les seuils d'attente (12 octobre 2026).
- [x] 1. API : `stageSince` et `noticePending` dans la liste des commandes en cours, tests (309 tests au total).
- [x] 2. Réglage « Nouvelle page Commandes » et interrupteur `NOUVELLE_PAGE_COMMANDES`, migration groupée avec celle
  du lot 11 (12 octobre 2026). Voir « Réglages des lots 11 et 12 » plus bas.
- [x] 3. Nouvelle page sur ordinateur (`/equipe/commandes-v2`) : colonnes réduites quand elles sont vides, « Payées »
  cachée avec le parcours court, explications repliées derrière « ? », cartes compactes sur 2 lignes, couleurs
  d'attente, plus longue attente en haut, bandeau et filtre « En retard seulement ».
- [x] 4. Téléphone et tablette : onglets avec les mêmes cartes et couleurs.
- [x] 5. Script `demo:affluence` (environ 30 commandes en cours, « Démo », réutilise les comptes, provenances et
  quartiers de la démonstration, effacées par `demo:effacer`), 3 tests ; essai à blanc sur dev le 12 octobre (30 en
  cours, aucune écriture). Écrit dans dev avec l'accord du client le 12 octobre à 18 h 10 : 34 commandes « Démo »
  ajoutées (31 encore en cours), règles rejouées et prix du serveur vérifiés avant l'écriture.
- [x] 6. Essais sur dev avec le coup de feu écrit (12 octobre) : liste lue par la fonction même du serveur
  (`listOrders`, lecture seule ; seule la connexion simulée dans le navigateur), 35 commandes en cours (dont 2
  anciennes commandes d'essai de dev). **Nouvelle page** : les 35 dans les bonnes colonnes, bandeau identique au calcul
  à part (35 en cours, 9 en retard, 2 à surveiller, 8 messages à confirmer), couleur et ✉ justes sur chaque carte ;
  sur ordinateur, 32 cartes entières visibles au lieu de 10. **Page actuelle** : marche normalement (35 cartes, mêmes
  colonnes et mêmes nombres). Aucune erreur dans le navigateur, en tailles téléphone, tablette et ordinateur. Captures,
  dont page actuelle et nouvelle page côte à côte : `captures-lot12-commandes\v2-vraies-donnees-dev\`. **STOP avant la
  mise en ligne.**
- [x] 7. Corrections demandées par le client le 12 octobre 2026, une fois la nouvelle page en ligne (sur dev,
  **sans migration** : aucun fichier du serveur pour la façon B, seuls les libellés de l'interrupteur changent pour la barre) :
  - **Barre ⋮** de l'espace équipe à la place de la barre de 11 éléments : logo, nom de la page, Alertes, ⋮ qui ouvre
    un panneau sur le côté (pages du rôle, nom de la personne connectée, Déconnexion). Décision du client : liée au
    réglage, renommé « Nouvelle page Commandes et barre ⋮ » (texte de la page Réglages expliqué) ; éteint = ancienne
    barre inchangée. Enregistrement local `f42a20a`.
  - **Étapes vides** : deux maquettes présentées (A : onglets et liste « Tout » ; B : étapes vides cachées et une
    ligne « Rien à vérifier… »), captures `C:\Users\HP\Desktop\belchiken\captures-lot12-barre-et-maquettes\`.
    Choix du client : **façon B, avec un onglet « Tout » en plus sur téléphone** (et tablette, même affichage).
  - Façon B codée : `waiting.js` (`boardColumns()` = étapes visibles et vides, `nothingLine()`, `byUrgency()`),
    `OrdersPage2.jsx`, `OrderCard2.jsx` (étape au-dessus de la carte dans « Tout »), `orders2.css` (bandes verticales
    retirées). `labels.js`, `OrdersList.jsx` inchangés. Tests du site : 24 (tous passent).
  - Vérifié sur dev (commandes réelles lues en lecture seule, API simulée dans le navigateur, aucune écriture), en
    tailles téléphone, tablette et ordinateur : **29 vérifications, aucun échec**. Coup de feu (35 commandes en cours) :
    5 colonnes pleines, aucune bande ; « Tout 35 » par défaut sur téléphone, rouges d'abord ; onglet d'une étape ;
    « En retard seulement » sans ligne « Rien à… » ; détail puis retour. 2 commandes : ligne « Rien à vérifier, rien en
    préparation, rien en livraison, rien à retirer. » et une seule colonne pleine largeur (« Tout 2 · À remercier 2 »
    sur téléphone). Aucune commande : « Aucune commande en cours. ». Réglage éteint : page et barre actuelles.
    Captures : `C:\Users\HP\Desktop\belchiken\captures-lot12-facon-b\`. Envoyé le 12 octobre 2026 avec l'accord écrit du client.
- [x] 8. Corrections du client (12 octobre 2026, sur dev, **sans migration**), liées au même réglage :
  - bouton ⋮ **tout en haut à droite** (la barre prend toute la largeur de l'écran au lieu de la colonne centrée),
    panneau ouvert sur la droite, sur une seule ligne même sur un petit téléphone ;
  - **page d'arrivée** selon le rôle (connexion et `/equipe`) : Patron → Tableau de bord (Commandes si
    `TABLEAU_DE_BORD` est fermé), Opérateur → Commandes, autres rôles comme avant ; éteint : Commandes pour tous.
    `teamHome()` dans `nav-pages.js`, testée (25 tests du site). Texte du réglage et de l'interrupteur complétés.
  - Vérifié sur dev avec la vraie API locale (sessions d'essai temporaires de « Patron (essai) », « Awa (essai) »,
    « Presta (essai) »), en tailles téléphone (390 et 340 px), tablette et ordinateur : **28 vérifications, aucun échec,
    aucune erreur**. Dev remise comme avant (réglages, interrupteurs, sessions, commandes identiques) ; 2 lignes de plus
    au journal de sécurité (fermeture et réouverture de `TABLEAU_DE_BORD` par « Presta (essai) »). Captures :
    `C:\Users\HP\Desktop\belchiken\captures-equipe-arrivee-et-barre\`. **STOP avant la mise en ligne.**
- [ ] Plus tard : seuils d'attente modifiables par le Patron (page Réglages).

### Réglages des lots 11 et 12 (migration groupée)

Décisions du client (12 octobre 2026) : une seule migration pour les deux réglages, schéma présenté avant ;
`/menu-borne` retirée (renvoie vers `/menu`), **sans** aperçu dans l'espace équipe pour l'instant ;
`/equipe/commandes-v2` gardée pour le Patron et le Prestataire, avec le lien « Voir la nouvelle page » dans Réglages.

- [x] Migration `20261012180000_menu_borne_page_commandes` : `AppSettings.kioskMenu` et `AppSettings.newOrdersPage`,
  oui/non, éteints par défaut ; écrite sans base (`prisma migrate diff`), schéma accepté par le client.
- [x] Serveur : réglages et interrupteurs `MENU_BORNE` et `NOUVELLE_PAGE_COMMANDES` (ouverts sans ligne),
  `GET /api/site` = `{ anglais, menuBorne }` (jamais le réglage de l'équipe). Site : `SiteFrame.jsx`, `MenuChoice.jsx`,
  `utils/site.js`, `utils/site-choice.js` ; espace équipe : `/equipe/commandes` choisit la page, page Réglages.
  `Menu.jsx`, `OrdersList.jsx`, `OrdersPage2.jsx` inchangés (commentaires mis à jour). README « Menu façon borne et
  nouvelle page Commandes ».
- [x] Démonstration : `demo:effacer` accepte une photo prise avant une migration (colonnes ajoutées remises par défaut,
  ignorées dans la comparaison).
- [x] Tests : 317 côté serveur (8 de plus), 17 côté site (4 de plus), tous passent.
- [x] Sauvegarde Neon de dev par le client (branche « sauvegarde-avant-lot11-12 »), puis `npm run db:deploy` sur dev
  seulement (`ep-nameless-band-b4vetndd`, vérifié deux fois) avec son accord, le 12 octobre 2026.
- [x] Essais sur dev (12 octobre 2026), vraie API locale (WhatsApp et alertes coupés), sessions d'essai temporaires
  de « Patron (essai) », « Awa (essai) » et « Presta (essai) », Edge sans fenêtre en tailles téléphone, tablette et
  ordinateur : **58 vérifications, aucun échec, aucune erreur dans le navigateur**.
  - Éteint : `/menu` = menu actuel avec l'en-tête ; `/menu-borne/burgers` → `/menu/burgers` ; Awa voit la page
    Commandes actuelle et `/equipe/commandes-v2` la renvoie vers `/equipe/commandes` ; le Patron ouvre la nouvelle
    page par le lien de Réglages ; un Opérateur ne peut pas changer un réglage (403).
  - Allumé : `/menu` en plein écran sans en-tête ni pied, changement de catégorie (`/menu/poulet`), plat ajouté,
    « Ma commande 1 », panier avec l'en-tête, retour au menu façon borne (aucune commande validée) ; Awa voit la
    nouvelle page sur `/equipe/commandes`, détail puis retour.
  - Prestataire : `MENU_BORNE` fermé → `/api/site` faux, menu actuel, le Patron ne peut pas rallumer (403
    `FONCTION_NON_INCLUSE`) ; `NOUVELLE_PAGE_COMMANDES` fermé → page actuelle ; les deux « Non inclus » dans Réglages ;
    réouverture → le choix du Patron revient. Téléphone qui se souvenait d'« allumé » : menu actuel dès la réponse.
  - Captures et rapport : `C:\Users\HP\Desktop\belchiken\captures-lot11-12-reglages\`.
- [x] Dev remise comme avant : `AppSettings` identique (mêmes valeurs, « NABI », même date), lignes d'interrupteurs
  de l'essai supprimées, sessions d'essai supprimées ; commandes (800, dont 793 « Démo ») identiques. Seules restent
  4 lignes du journal de sécurité (fermeture et réouverture des deux interrupteurs par « Presta (essai) ») : la base
  refuse de les effacer.
- [x] Démonstration vérifiée en lecture seule : la photo d'avant ne connaît pas les 2 colonnes ; `demo:effacer` les
  remettrait à « éteint », et `AppSettings` est identique à la photo sur ses colonnes (sans la correction, il aurait été
  signalé différent). Données « Démo » en place (793 commandes, 30 en cours, 13 comptes).
- [x] Enregistrement local (pas sur GitHub).
- [x] Mise en ligne le 12 octobre 2026 avec l'accord écrit du client (6 enregistrements jusqu'à `6000564`, sauvegarde Neon de production avant). Migration
  `20261012180000_menu_borne_page_commandes` passée en production : **vérifiée par le client dans le journal de
  Render** (capture faite).
- [x] Corrections du lot 12 (barre ⋮ `f42a20a`, façon B `8a5fcc3`) envoyées le 12 octobre 2026 avec l'accord écrit du
  client, **sans migration**.

### Tableau de bord d'un coup d'œil (13 octobre 2026)

Analyse et proposition présentées le 13 octobre (captures `C:\Users\HP\Desktop\belchiken\captures-tableau-de-bord-analyse\`).
Décisions du client : nouveauté **liée au réglage « Nouvelle page Commandes et barre ⋮ »** (pas de migration) ; ancien
tableau de bord gardé sur la même page, replié sous « Analyse détaillée » ; frais de livraison sur une seule ligne ;
corriger le titre en double et le « −100 % » rouge en début de journée ; le nouveau bloc doit rester rapide, sans calcul
lourd. Détails : README « Tableau de bord d'un coup d'œil ».

- [x] 1. Serveur : `GET /api/staff/dashboard/aujourdhui` (lecture seule, Patron et Prestataire, `TABLEAU_DE_BORD`),
  `services/today.js`, `getToday()` ; API complétée, rien retiré, schéma inchangé. Tests : 322 côté serveur (5 de plus).
- [x] 2. Site : blocs « Maintenant », « Aujourd'hui », plats, provenance (`TodayBlocks.jsx`, `now.js`, `compare.js`,
  `today.css`), « Analyse détaillée » repliée (`Dashboard.jsx`), lien « en retard » vers la page Commandes filtrée
  (`?retard=1`, `OrdersPage2.jsx`). Corrigé au passage : le bouton « Réessayer » de l'ancien tableau de bord (fonction
  introuvable, la page aurait planté en cas d'erreur). « Trop tôt pour comparer » aussi dans l'ancien tableau de bord
  (période en cours), réglage allumé ou non. Tests : 32 côté site (7 de plus).
- [x] 3. Essais sur dev (13 octobre 2026) : `demo:affluence` relancé avec l'accord du client (36 commandes « Démo »
  ajoutées, 60 en cours avec celles du 12) ; vraie API locale (WhatsApp et alertes coupés), session d'essai temporaire de
  « Patron (essai) » supprimée ensuite (11 sessions avant et après), réglage simulé dans le navigateur, toute écriture
  bloquée. **41 vérifications, aucun échec, aucune erreur dans le navigateur** : arrivée sur le tableau de bord, pas de
  titre en double, chiffres = serveur = « Jour » de l'analyse détaillée (474 500 F, 30 commandes, panier 15 817 F), plats du
  jour et des 7 jours, provenance, analyse repliée et non chargée puis ouverte, lien « en retard » (49 = page Commandes),
  lien « à vérifier », début de journée simulé (aucun rouge), petit téléphone 340 px, réglage éteint = page d'avant.
  Captures : `C:\Users\HP\Desktop\belchiken\captures-tableau-de-bord-coup-d-oeil\`.
- [x] Temps de réponse en local (depuis le Burkina, connexion comprise) : nouvelle adresse ~3 s (calcul seul : 0,6 à
  1,1 s) ; ancienne : Jour ~4 s, Semaine 7 à 11 s, Mois 21 à 26 s.
- [ ] Ancienne adresse plus rapide sans changer les chiffres (lectures en parallèle ; essai à part : Jour 0,6 s au lieu de
  1,8 s, mois précédent 2,7 s au lieu de 10 à 14 s) : **attend l'accord du client**.
- [x] 4. Documentation, enregistrement local. **STOP avant la mise en ligne** (rien sur GitHub sans accord écrit).

### Livreurs indépendants (14 octobre 2026, pas encore en ligne)

Troisième mode de livraison, option (a) choisie par le client : compte Livreur « Indépendant » créé par le Patron.
Derrière l'interrupteur `LIVREURS_INDEPENDANTS`, fermé par défaut. Détails : README « Livreurs indépendants ».

- [x] Code et tests (`backend/test/livreurs-independants.test.js`, interrupteur fermé = rien ne change, prouvé).
- [x] Migration `20261014120000_livreurs_independants` écrite sans base (`ALTER TYPE "DeliveryOperator" ADD VALUE 'INDEPENDANT'`).
- [x] **16 octobre 2026 : plus prioritaire** (notre équipe livre, voir « Idées à discuter avec Belchicken »). Migration
  rangée dans `backend/prisma/migrations-en-attente/` (Prisma ne la lit pas, Render ne l'appliquera pas). Le serveur
  démarre et `prisma migrate status` ne voit rien en attente sur dev. Ne pas ouvrir l'interrupteur avant de la remettre.
- [ ] Remettre le dossier dans `backend/prisma/migrations/`, sauvegarde Neon de dev par le client, puis migration
  appliquée sur dev (`npm run db:deploy`), avec son accord écrit.
- [ ] Essais sur dev (interrupteur ouvert sur dev seulement), puis refermé.
- [ ] Envoi sur GitHub avec l'accord écrit du client (Render applique alors la migration en production :
  sauvegarde de production avant).
- [ ] Modèles Meta `…_independant` à soumettre seulement avant l'envoi automatique.

### Nouveau visuel de l'espace équipe (16 octobre 2026, pas encore en ligne)

Style « application » de l'espace équipe, apparence seulement, derrière l'interrupteur `NOUVEAU_VISUEL` (Prestataire),
fermé sans ligne. Aucune migration. Détails : README « Nouveau visuel de l'espace équipe ».

- [x] Code et tests (`frontend/src/staff/nv/visual.test.js`, `backend/test/prestataire.test.js`), construction du site.
- [x] Interrupteur ouvert sur dev le 16 octobre 2026 pour l'essai complet en mode Prestataire (avant : aucune ligne ;
  pour remettre : supprimer la ligne `NOUVEAU_VISUEL`). Laissé ouvert à la demande du client.
- [ ] Essai par le client sur le vrai site, avec de vrais téléphones (le client ouvre l'interrupteur avec son compte
  Prestataire de production ; fermé = rien ne change pour Belchicken).
- [ ] Envoi sur GitHub avec l'accord écrit du client, après sa sauvegarde Neon de production.

### Décisions du 16 octobre 2026 : les cinq plans

Ordre choisi par le client : **plan 1** (call center allégé), puis **4** (suivi du client sans messages payants),
**3** (frais par la position avant le paiement), **2** (paiement du repas validé automatiquement), **5** (livraison
séparée de Belchicken). Plan 4, décision du client : sur la page de suivi, le client appellera **le livreur directement**.

### Plan 1 : call center allégé (16 octobre 2026, pas encore en ligne)

Interrupteur `CALL_CENTER_ALLEGE` (Prestataire), fermé sans ligne, aucune migration. Détails : README « Call center
allégé (plan 1) ».

- [x] Aucune étape n'attend plus un message (sauf le remerciement ; frais manquants toujours bloquants).
- [x] « Paiement vérifié » imprime le bon dans le même geste.
- [x] Le livreur valide sans code avec un motif obligatoire ; signalé en rouge au Responsable livraison (alerte et
  liste) ; compté à part dans le relevé (page, PDF, Excel).
- [x] Tests (`backend/test/call-center-allege.test.js`, `frontend/src/staff/orders/print-slip.test.js`), construction.
- [ ] Essai par le client (interrupteur ouvert sur dev ou en production avec son accord).
- [ ] Envoi sur GitHub avec l'accord écrit du client.

### Plan 4 : suivi du client sans WhatsApp (16 octobre 2026, pas encore en ligne)

Interrupteur `SUIVI_SANS_WHATSAPP` (Prestataire), fermé sans ligne. Détails : README « Suivi du client sans WhatsApp
(plan 4) ».

- [x] Page de suivi en direct (livreur à appeler, code, montant, merci et avis), lien avec clé secrète, alertes Web
  Push avec repli iPhone, bandeau « Votre commande en cours », partager / copier le lien, call center sans message.
- [x] Tests (`backend/test/suivi-sans-whatsapp.test.js`, `frontend/src/utils/tracking.test.js`), construction.
- [x] Migration `20261016180000_suivi_sans_whatsapp` écrite sans base, **non appliquée**, dans
  `backend/prisma/migrations-en-attente/`.
- [x] 16 octobre 2026 : sauvegarde de production « sauvegarde-prod-avant-suivi » par le client, dossier déplacé dans
  `backend/prisma/migrations/`, envoi avec l'accord écrit du client (dev **non migrée** : la migrer avant tout essai local).
- [ ] (rappel) **Ne pas envoyer sur GitHub sans la migration** (le code lit la colonne `trackingKey`). Avec l'accord écrit du
  client : sauvegarde Neon de dev, migration sur dev, essais ; puis sauvegarde de production, dossier déplacé dans
  `backend/prisma/migrations/`, envoi (Render applique la migration).

### Plan 3 : frais par kilomètre avant le paiement (16 octobre 2026, pas encore en ligne)

Interrupteur `FRAIS_PAR_KM` (Prestataire), fermé sans ligne. Détails : README « Frais par kilomètre avant le paiement
(plan 3) ».

- [x] Grille par km du Patron, distance par la route (OpenRouteService, repli vol d'oiseau × 1,3 « estimation »),
  « J'accepte » avant le paiement du repas, quartier sans position, « Autre quartier » retiré, call center sans
  correction des frais.
- [x] Tests (`backend/test/frais-par-km.test.js`, `frontend/src/utils/km-fee.test.js`), construction.
- [x] Migration `20261016200000_frais_par_km` écrite sans base, **non appliquée**, dans `backend/prisma/migrations-en-attente/`.
- [ ] Le client crée la variable Render `OPENROUTESERVICE_API_KEY` (clé gratuite d'openrouteservice.org).
- [x] 16 octobre 2026 : sauvegarde « sauvegarde-prod-avant-lots-3-4 » par le client, migration déplacée dans
  `backend/prisma/migrations/`, envoi avec son accord écrit (dev **non migrée**).
- [ ] Le Prestataire ouvre l'interrupteur, le Patron règle et allume sa grille.

### Plan 2 : paiement du repas validé automatiquement (16 octobre 2026, pas encore en ligne)

Deux interrupteurs indépendants du Prestataire, fermés sans ligne (depuis le 16 octobre 2026, à la place de
`PAIEMENT_AUTO`) : `PAIEMENT_AUTO_SMS` « Paiement automatique par SMS » et `PAIEMENT_LIGDICASH` « Paiement en ligne
Ligdicash » ; en plus `PAIEMENT_SMS_ESSAI` « Formats SMS d'essai ». Détails : README « Paiement du repas validé
automatiquement (plan 2) ».

- [x] Solution B (SMS du téléphone marchand) : lecteur, rapprochement, journal, « Tester un SMS », call center.
- [x] Solution A (Ligdicash) : structure seulement, sans identifiants.
- [x] Tests (`backend/test/paiement-auto.test.js`), construction.
- [x] Migration `20261016220000_paiement_auto` écrite sans base, **non appliquée**, dans `backend/prisma/migrations-en-attente/`.
- [x] Deux interrupteurs (SMS, Ligdicash) ; les deux ouverts = chaque commande validée une seule fois (16 octobre 2026, commit local).
- [x] Format d'essai « Orange Money · transfert reçu (essai) » d'après un vrai SMS du client (téléphone personnel),
  derrière l'interrupteur « Formats SMS d'essai » ; transfert envoyé écarté (16 octobre 2026, commit local).
- [ ] Essai réel avec le téléphone personnel du client (README, plan 2), puis fermer « Formats SMS d'essai ».
- [ ] Le client fournit un vrai SMS de paiement reçu par opérateur (Orange Money, Moov Money, Telecel Money) ; formats
  corrigés et marqués vérifiés (`supposed: false`).
- [ ] Le client crée `SMS_PAIEMENT_CLE` sur Render et installe « Transitaire SMS » sur le téléphone marchand (corps `{"from":"{in-number}","text":"{msg}"}`, accepté, vérifié le 16 octobre 2026).
- [ ] Accord écrit de Belchicken pour transmettre les SMS du téléphone marchand.
- [x] 16 octobre 2026 : même sauvegarde, migration déplacée, envoi avec l'accord écrit du client (dev **non migrée**).
- [ ] Ouverture de l'interrupteur, seulement après les vrais formats de SMS.
- [ ] Ligdicash : contrat, identifiants, bouton « Payer en ligne » pour le client.

### Commande simplifiée côté client (16 octobre 2026, pas encore en ligne)

Interrupteur `COMMANDE_SIMPLIFIEE` (Prestataire), fermé sans ligne, aucune migration. Détails : README « Commande
simplifiée (site client) ».

- [x] Panneau « Ma commande » sur le menu (classique et borne), page de commande unique dans l'ordre demandé, carte
  OpenStreetMap si la position est refusée ou imprécise, plus aucun quartier, très peu de texte.
- [x] Tests (`frontend/src/utils/simple-order.test.js`, `backend/test/menu-borne-commandes.test.js`), construction.
- [x] Complément : panneau « Votre commande » à droite sur écran large, « + dernier plat ajouté » dans la barre du
  téléphone (`cd5a12e` déjà en ligne, interrupteur fermé ; complément en commit local).
- [x] Téléphone : la barre mène directement à la page de commande (plus de panneau), `/commande` aussi ; récapitulatif
  replié et modifiable en haut de la page de commande (commit local).
- [x] Écran large : panneau seulement avec des plats, glisse depuis la droite, disparaît à « Commander » ou panier vide
  (commit local).
- [x] Prix collé à « Livraison » (« Livraison · 1 400 F »), position obligatoire pour toute livraison (site et serveur),
  « À récupérer » au lieu de « À emporter » partout (site, messages, espace équipe) (commit local).
- [ ] Essai par le client sur téléphone et ordinateur (de préférence avec la grille par km du plan 3 allumée).
- [ ] Envoi sur GitHub avec l'accord écrit du client.

### Compte Patron simplifié, lot A (17 octobre 2026, pas encore en ligne)

Interrupteur `COMPTE_PATRON_SIMPLE` (Prestataire), fermé sans ligne. Détails : README « Compte Patron simplifié ».

Contrôle des chiffres du tableau de bord actuel (rien n'y a été changé, `test/compte-patron.test.js`) :

- Chiffre d'affaires, commandes payées, panier moyen : plats des commandes payées et au-delà, le jour où la commande a
  été passée (une commande de 23 h 55 payée à 0 h 05 compte la veille). Jamais les annulées ni celles à vérifier.
- Annulées : un seul nombre, qui mélange les commandes payées puis annulées (argent à rendre) et celles jamais payées.
- Frais de livraison : jamais dans le chiffre des plats. « Frais encaissés » = seulement les livreurs du restaurant ;
  ceux de notre équipe (mode Prestataire) sont montrés au Patron à part (« payés sur ses codes, non comptés »).
- Payées automatiquement (SMS) et saisies par un agent : comptées comme les autres (Ventes : « Paiement automatique »
  apparaît comme un vérificateur).
- Commandes d'essai : **comptées partout** (aucun moyen de les reconnaître).
- Heures et jours de pointe : la demande (commandes reçues, même jamais payées), sans les annulées ; jours en total
  (un mois à 5 samedis gonfle le samedi).
- Paiements Orange / Moov / Telecel : les anciennes commandes en espèces sont dans le chiffre mais pas dans ce bloc.

Corrigé dans la page Comptes seulement (derrière l'interrupteur) : date de début des comptes (`COMPTES_PATRON_DEPUIS`),
annulations séparées (après / avant paiement), heures et jours sur les ventes payées, jours en moyenne par jour ouvert,
frais de notre équipe absents.

- [x] 5 onglets, page Comptes, phrases, carte des clients, transactions et Excel, résumés du soir et de la semaine,
  alertes importantes seulement, réveil par cron-job.org (clé `RESUME_PATRON_CLE`).
- [x] Tests (backend 420, frontend 63), construction, page vue avec des données inventées (faux serveur, aucune base).
- [x] Migration `20261017120000_compte_patron` écrite, rangée dans `migrations-en-attente/`, appliquée nulle part.
- [ ] Essai par le client ; choix de la date `COMPTES_PATRON_DEPUIS` ; compte cron-job.org et clé sur Render.
- [ ] Migration (sauvegarde Neon, accord écrit), puis envoi sur GitHub avec l'accord écrit du client.

### Compte Patron, lot B (17 octobre 2026, pas encore en ligne)

Même interrupteur `COMPTE_PATRON_SIMPLE`. Détails : README « Compte Patron simplifié », « Lot B ».

- [x] Objectif du mois, rapport mensuel à imprimer en PDF (et annonce le 1er), application « BC Patron » ouverte sur
  Comptes, clients fidèles sans données personnelles, note des avis.
- [x] Tests (backend 427, frontend 64), construction, pages vues avec des données inventées (faux serveur, aucune base).
- [x] Migration du lot A complétée (même table neuve `PatronAccount`, jamais appliquée), toujours en attente.
- [ ] Essai de l'installation « BC Patron » sur un vrai téléphone Android et un iPhone.
- [ ] Essai par le client, puis migration et envoi sur GitHub avec son accord écrit.

Plan d'origine :

1. **Objectif du mois** : le Patron tape un montant (onglet Comptes, « Mon objectif ») ; barre de progression sous les
   ventes du mois, phrase « Encore 320 000 F en 13 jours, soit 24 600 F par jour » ; rappel dans le résumé du soir.
   Une colonne `monthlyGoal` dans `PatronAccount` (ou une petite table par mois pour garder l'historique) : migration.
2. **Rapport mensuel PDF** aux couleurs Belchicken : page d'impression comme le relevé et les ventes (pas de
   bibliothèque PDF sur le serveur), logo, ventes, évolution, plats, heures, carte, avis ; prévenu le 1er du mois par le
   réveil (« Votre rapport de septembre est prêt »).
3. **Application installable** avec l'icône Belchicken pour le Patron : l'application « Belchicken Équipe » existe
   déjà ; il suffit d'ouvrir sur Comptes (`start_url` du manifeste ou page d'arrivée) et de proposer l'installation
   depuis « Mon compte ». Pas de Play Store (lot 10).
4. **Clients fidèles** sans données personnelles : clients revenus (même numéro, empreinte calculée par le serveur,
   jamais affichée), part des commandes faites par des habitués, « 38 clients sont revenus ce mois-ci », meilleurs
   clients en rang seulement (« Client n° 1 : 14 commandes, 96 000 F »), jamais de nom ni de numéro.

## Démonstration commerciale (base dev)

Pour la présentation commerciale à Belchicken : un mois d'activité fictive sur la base **dev** seulement (tableau de
bord, ventes par provenance et par agent, avis, caisse, relevé en mode Prestataire). Mode d'emploi et garde-fous :
README « Démonstration commerciale ».

- [x] Scripts `demo:remplir` (essai à blanc `--essai`), `demo:effacer`, `demo:mot-de-passe` et 13 tests (303 au
  total, tous passent). Enregistrement local `bcc13e1` (12 octobre 2026), **pas envoyé sur GitHub** : il ne change ni
  le site, ni l'API, ni la base de production.
- [x] Remplissage de dev par le client (12 octobre) : 759 commandes « Démo », photo enregistrée, compte « Prestataire
  (Démo) » créé par le client. Chiffres recalculés à part et identiques au serveur (ventes, provenances, agents, avis,
  caisse, tableau de bord, relevé). Montant dû : livraison offerte payée 500 F **plus** 300 F (règle du lot 5d).
- [ ] Scénarios du client en mode Prestataire (Responsable livraison, livreurs de notre équipe).
- [ ] Essai de l'effacement (`demo:effacer`, comparaison avec la photo) : **attend l'accord du client**.
- [ ] Nouveau remplissage le jour de la présentation.

## Idées à discuter avec Belchicken

Rien n'est décidé ni codé. Le but du logiciel est d'alléger le travail du call center, pas de lui déplacer ni de lui
ajouter des tâches. Décision du client le 13 octobre 2026 : pas de rôle Caissier, pas de réglage « Encaissement
réservé », pas de migration pour l'instant.

**Fonctionnement réel de Belchicken** (noté le 13 octobre 2026) :

1. Le client paie par dépôt Mobile Money.
2. Le call center vérifie le dépôt sur le téléphone marchand. **Il ne touche jamais d'argent liquide.**
3. Il imprime le bon de commande, qui est apporté à la caisse.
4. Le caissier valide : il enregistre la commande dans sa caisse et sort un ticket de caisse.
5. Le bon et le ticket de caisse partent ensemble en cuisine.

**Questions à poser :**

- [x] **Qui reçoit l'argent des livreurs dans l'application ?** Réponse du client le 14 octobre 2026 : **le Patron
  seulement** (à confirmer plus tard avec Belchicken ; si c'est le caissier, on adaptera). Fait le 14 octobre 2026, sans
  migration : « Espèces remises » refusé à l'Opérateur par l'API, sa page Caisse n'a plus que « Frais à vérifier »,
  textes corrigés, remises de la démonstration reçues par « Patron (Démo) » (au prochain remplissage). Avant, le bouton
  était ouvert au Patron **et** au call center (Opérateur), alors que le call center ne touche jamais d'espèces. Vérifier un dépôt Mobile Money (constater sur le téléphone marchand)
  n'est pas encaisser : seul « Espèces remises » est un vrai encaissement.
- [ ] **Veulent-ils un jour rapprocher les commandes de l'application et les tickets de caisse ?** (par exemple
  retrouver le ticket d'une commande, ou vérifier que chaque commande payée a bien son ticket)

**Nouvelles décisions du client (16 octobre 2026)** :

- Belchicken nous a confié la livraison par contrat : c'est **notre équipe** (mode Prestataire) qui livre. Le mode
  « Livreurs indépendants » n'est plus prioritaire : code gardé tel quel, interrupteur `LIVREURS_INDEPENDANTS` fermé,
  migration `20261014120000_livreurs_independants` **non appliquée** (le serveur et le site démarrent sans elle) et
  rangée dans `backend/prisma/migrations-en-attente/` pour que Render ne l'applique pas.
- Essai du site complet en mode Prestataire : sur le **vrai site**, avec de vrais téléphones (décision du 16 octobre
  2026, plus en local). Le client crée lui-même son compte Prestataire de production (README « Compte Prestataire »).
- **Plus tard (pas maintenant)** : repas payé en ligne et validé automatiquement (plus de vérification par le call
  center) ; frais de livraison calculés d'après la position du client avant le paiement, puis payés **au livreur** à
  la livraison ; la livraison aura sa propre adresse et son propre hébergement, reliés à Belchicken. Plan à faire
  après l'essai complet en mode Prestataire sur dev du 16 octobre 2026.

**Les deux vrais gains pour le call center** (ils dépendent de Belchicken) :

- [ ] **Paiement automatique** : la commande part seule quand le dépôt arrive, plus de vérification à la main sur le
  téléphone marchand. Demande un accès aux paiements du compte marchand (Orange Money, Moov Money, Telecel Money).
- [ ] **WhatsApp automatique** (lot 9) : les messages au client partent seuls à chaque étape, plus de bouton ni de
  confirmation d'envoi. Demande l'application Meta et les modèles de messages approuvés.

## Avant la livraison à Belchicken

À faire une seule fois, juste avant de remettre l'application au restaurant (aujourd'hui, tout est encore en test).
Chaque point se fait avec l'accord du client, et chaque action sur la production est annoncée avant.

- [ ] **Nettoyer les commandes d'essai en production**, avec un script sûr : il ne supprime **que les commandes** et ce qui
  leur appartient (lignes, boissons, historique, événements, journal des alertes, remises d'espèces liées). **Jamais** le
  menu, les photos, les comptes de l'équipe, les réglages, la grille des frais ni les provenances. Le script affiche
  d'abord ce qu'il va supprimer (nombre de commandes, références) et attend une confirmation ; sauvegarde Neon juste avant.
- [ ] **Passer Render en offre Starter** (le serveur ne s'endort plus : pas d'attente au premier client du matin).
- [ ] **Passer Neon en offre payante** pour désactiver la mise en veille de la base de production (offre gratuite :
  veille après 5 minutes sans requête, qui ferme les connexions ouvertes, erreur `P1017` ; les lectures sont réessayées
  depuis le 12 octobre 2026, pas les enregistrements).
- [x] **Changer le mot de passe Neon de production**, puis mettre à jour `DATABASE_URL` sur Render : fait par le client le
  10 octobre 2026 (dev et production, `backend/.env` et Render mis à jour ; dev et production répondent).
- [ ] **Nettoyer les variables Render** : retirer celles qui ne servent plus ou d'essai, vérifier les autres
  (codes marchands, `PUBLIC_SITE_URL`, WhatsApp, Cloudinary, clés des alertes).
- [ ] **Créer les comptes** des agents du call center (Opérateur) et des livreurs (Livreur), page Équipe du Patron.
- [ ] **Faire remplir la grille des frais de livraison** par le Patron (quartiers, tranches de distance, et supplément
  de nuit une fois le lot 3 en ligne).
- [ ] **Former le call center** : commandes une étape à la fois, messages WhatsApp, vérification Mobile Money (jamais
  d'espèces), prise de commande par l'agent,
  bon de commande ; et les livreurs à leur page de courses.
