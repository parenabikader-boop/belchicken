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
| 5 | Livraison en deux modes (Restaurant / Prestataire) | En cours : 5a en ligne depuis le 10 octobre 2026 (mode Restaurant en production) ; 5b prêt sur dev, en attente de mise en ligne ; 5c, 5d à faire |
| 6 | Ventes globales, par agent et par provenance, export Excel et PDF | À faire |
| 7 | Avis des clients | À faire |
| 8 | Langue FR/EN sur le site client | À faire |
| 9 | WhatsApp automatique (API Meta), deux numéros | À faire |
| 10 | Application Play Store | À faire |

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
| 5b | Disponibilité des livreurs, livreurs du restaurant ou de notre équipe, rôle `RESPONSABLE_LIVRAISON`, caisse séparée | Prêt sur dev (10 octobre 2026), STOP avant la mise en ligne |
| 5c | « Prête pour livraison », « Commande récupérée », tournées, preuves horaires | À faire |
| 5d | Conditions du contrat (versions datées), relevé par période, PDF et Excel, interrupteur `RELEVE` | À faire |

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
  plus long (code du projet non modifié). Sur Render, la base est proche : rien à changer a priori.
- [x] dev remise comme avant : commandes, comptes, sessions, remises, disponibilités, réglages (`AppSettings` remis à l'identique),
  société de livraison, interrupteur. Seules restent 35 lignes du journal de sécurité (la base refuse de les effacer, voulu).
- [x] Captures (18 images) dans `C:\Users\HP\Desktop\belchiken\captures-lot5b-equipes\`.
- [ ] Accord du client sur les captures, sauvegarde Neon `sauvegarde-lot5b`, mise en ligne (migration
  `20261010180000_livraison_equipes_5b` : structure seulement, relue : aucun `INSERT`, `UPDATE` ni `DELETE`).

### 6. Ventes

- Ventes globales, par agent et par provenance, avec le mode de paiement, par période.
- Export Excel et PDF.

### 7. Avis des clients

- Lien dans le message de remerciement.
- Notes par étoiles (call center, restaurant, livraison) et commentaire.
- Moyennes par agent et par livreur ; alerte au Patron en cas de mauvaise note.

### 8. Langue FR/EN

- Sur le site client, français par défaut.

### 9. WhatsApp automatique

- API Meta, une fois tous les messages définitifs, pour les deux numéros.

### 10. Application Play Store

## Avant la livraison à Belchicken

À faire une seule fois, juste avant de remettre l'application au restaurant (aujourd'hui, tout est encore en test).
Chaque point se fait avec l'accord du client, et chaque action sur la production est annoncée avant.

- [ ] **Nettoyer les commandes d'essai en production**, avec un script sûr : il ne supprime **que les commandes** et ce qui
  leur appartient (lignes, boissons, historique, événements, journal des alertes, remises d'espèces liées). **Jamais** le
  menu, les photos, les comptes de l'équipe, les réglages, la grille des frais ni les provenances. Le script affiche
  d'abord ce qu'il va supprimer (nombre de commandes, références) et attend une confirmation ; sauvegarde Neon juste avant.
- [ ] **Passer Render en offre Starter** (le serveur ne s'endort plus : pas d'attente au premier client du matin).
- [ ] **Changer le mot de passe Neon de production**, puis mettre à jour `DATABASE_URL` sur Render.
- [ ] **Nettoyer les variables Render** : retirer celles qui ne servent plus ou d'essai, vérifier les autres
  (codes marchands, `PUBLIC_SITE_URL`, WhatsApp, Cloudinary, clés des alertes).
- [ ] **Créer les comptes** des agents du call center (Opérateur) et des livreurs (Livreur), page Équipe du Patron.
- [ ] **Faire remplir la grille des frais de livraison** par le Patron (quartiers, tranches de distance, et supplément
  de nuit une fois le lot 3 en ligne).
- [ ] **Former le call center** : commandes une étape à la fois, messages WhatsApp, caisse, prise de commande par l'agent,
  bon de commande ; et les livreurs à leur page de courses.
