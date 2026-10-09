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
| 1 | Parcours court (option) + bon de commande imprimable | En ligne depuis le 8 octobre 2026 (réglage « Parcours court » éteint en production) |
| 2 | Prise de commande par l'agent (appel, WhatsApp) | En ligne depuis le 9 octobre 2026 (réglage « Prise de commande par l'agent » éteint en production) |
| 3 | Supplément de nuit dans la grille des frais | En ligne depuis le 9 octobre 2026 (réglage « Supplément de nuit » éteint en production) |
| 4 | Compte Prestataire au-dessus du Patron | À faire |
| 5 | Livraison en deux modes (Restaurant / Prestataire) | À faire |
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

Fait, en ligne depuis le 8 octobre 2026 (réglage éteint en production) : réglage `AppSettings.shortFlow` (page « Réglages » du Patron, `/equipe/reglages`), commande notée
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
