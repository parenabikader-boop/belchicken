# Belchicken · Commande en ligne

**Toujours répondre au client en français, avec des explications simples, sans jargon.**

Site de commande en ligne et espace équipe du restaurant Belchicken Burkina (Ouagadougou, Burkina Faso). Le client choisit ses plats, paie par mobile money, indique sa position (ou choisit « À emporter ») et valide ; l'équipe reçoit une alerte, vérifie le paiement, prépare, fait livrer ou remet la commande, et prévient le client sur WhatsApp à chaque étape depuis l'espace équipe. Nous sommes prestataires du logiciel ; l'application n'est pas encore remise à Belchicken : tout est en test, y compris la production.

Restaurant : Kamsonghin, en face de Sonia Hôtel ; Plus Code 9F2J+V8 Ouagadougou (12.352187, -1.519188) ; WhatsApp du call center (commandes, suivi, boutons « Nous contacter sur WhatsApp ») +226 05 23 48 48 ; numéro du restaurant (contact, tickets de caisse) +226 62 88 42 88 ; ouvert du dimanche au jeudi 6 h – 23 h, vendredi et samedi 24 h/24. Nom affiché « Belchicken Burkina », le logo et « Belchicken » restent tels quels. Jamais de boîte postale (11 BP 4928). Toutes ces informations sont dans `frontend/src/restaurant.js` (site) et `backend/src/config/env.js` (messages).

Projet totalement indépendant de TWIA FOOD : aucun code partagé.

## Où trouver les détails

- `README.md` : installation, API, messages WhatsApp et modèles Meta à soumettre, espace équipe, mise en ligne, et une section par fonction.
- `docs/feuille-de-route.md` : les 10 lots, réponses du client, avancement, essais, captures, sauvegardes Neon, enregistrements Git, « Avant la livraison à Belchicken ».
- `backend/prisma/migrations/` : une migration par fonction (nom dans le README).

## Stack

- backend : Node.js 20+, Express, Prisma 6, PostgreSQL (Neon), Zod. Port 3006. Déploiement Render.
- frontend : React + Vite. Port 5173. Déploiement Vercel.
- Tout le texte visible par les clients est en français.
- `npm run dev` à la racine lance les deux ; `npm test` dans `backend/` (248 tests au 11 octobre 2026).

## État actuel (11 octobre 2026)

Site client et commandes :

- **Commande en ligne** (livraison ou à emporter, paiement des plats par code marchand) : en ligne. Règles : `pricing.js`, `order-status.js` (`FLOWS`). README « API », « À emporter ».
- **Boissons** (comprises dans les formules ou en plus) : en ligne. Règles : `pickDrinks()` dans `pricing.js`. README « Boissons ».
- **Suivi client** `/suivi/:reference` et messages WhatsApp à chaque étape : en ligne, envoi automatique **éteint** (`WHATSAPP_CUSTOMER_AUTO`). Règles : `customer-messages.js`. README « Messages WhatsApp au client ».
- **Application installable** (« Belchicken » et « Belchicken Équipe ») et **alertes sur téléphone** de l'équipe : en ligne. README « Application installable », « Espace équipe ».

Espace équipe (`/equipe`, `frontend/src/staff/`, API `/api/staff`, droits vérifiés par `requireStaff()`) :

- **Comptes** : Patron (`npm run equipe:patron`), Opérateur et Livreur (page Équipe du Patron). Règles : `team.js`, `staff-auth.js`. README « Espace équipe ».
- **Commandes** : une étape à la fois, détail, changement de statut, recherche, bon de commande. Règles : `order-status.js`, `customer-messages.js`. README « Espace équipe ».
- **Menu et photos** (Cloudinary), **accueil**, **tableau de bord** (Patron) : en ligne. Règles : `menu-edit.js`, `photo.service.js`, `dashboard.js`.
- **Frais payés au livreur** et **Caisse** : en ligne. Règles : `order-status.js`, `cash.js`.
- **Espace livreur** (courses du jour, code de remise) : en ligne. Règles : `courier.js`.
- **Grille des frais de livraison** : en ligne, **grille vide en production** (frais saisis par l'équipe, comme avant). Règles : `delivery-fees.js`. README « Grille des frais de livraison ».

Lots de la feuille de route :

- **Lot 1, parcours court et bon de commande** : en ligne, réglage « Parcours court » **allumé en production** (par le client le 9 octobre 2026, gardé allumé). Règles : `order-status.js`, `OrderSlip.jsx`. README « Parcours court ».
- **Lot 2, prise de commande par l'agent** : en ligne, réglage **éteint en production**. Règles : `order-sources.js`. Feuille de route, lot 2.
- **Lot 3, supplément de nuit** : en ligne, réglage **éteint en production**. Règles : `delivery-fees.js`. README « Supplément de nuit ».
- **Lot 4, compte Prestataire** : en ligne, **aucun compte Prestataire en production** (à créer plus tard depuis le terminal de Render), donc toutes les fonctions ouvertes. Règles : `features.js`, `prestataire-auth.js`, `roles.js` (`isPatronLevel()`, `accessFor()`). README « Compte Prestataire ».
- **Lot 5, livraison en deux modes** : terminé le 11 octobre 2026 ; production en **mode Restaurant**, réglage « Tournées et disponibilité » **éteint**, interrupteur `RELEVE` **fermé**, aucun Responsable livraison, aucun livreur de notre équipe, aucune version des conditions : rien ne change en production. Migrations 5a à 5d **non vérifiées dans le tableau de bord de Render** par le client.
  - 5a, mode de livraison : `delivery-mode.js`. README « Mode de livraison ».
  - 5b, équipes et disponibilité des livreurs, Responsable livraison (ne voit **jamais** les ventes, `test/route-access.test.js`) : `courier-team.js`. README « Équipes de livraison ».
  - 5c, prête pour livraison, récupération, tournées, preuves (la base refuse de modifier l'historique) : `dispatch.js`, `dispatch.service.js`. README « Prête pour livraison ».
  - 5d, contrat et relevé (PDF, Excel) : `statement.js`. README « Relevé de livraison et contrat ».
- **Prochain : lot 6, ventes.**

## Repères pour travailler

- Base dev : garder le compte Opérateur « Awa (essai) », il sert aux essais. Comptes d'essai du lot 4 : « Presta (essai) » (70 99 00 01) et « Patron (essai) » (70 99 00 09).
- Clés Cloudinary, VAPID (alertes) et `PRESTATAIRE_TOTP_KEY` : dans `backend/.env` et sur Render, jamais dans le code ni la conversation.
- `backend/prisma/menu-data.js` contient le menu de départ complet. Ne pas inventer de plats ni de prix. Il ne sert qu'à remplir une base vide : `seed.js` ne fait rien dès qu'un plat existe. La base fait foi pour le menu.
- Une seule ambiance sur tout le site (fond crème, rouge Belchicken, brun foncé) : le client ne veut pas de couleur par catégorie. Chaque catégorie du menu se distingue par son petit titre, sa photo vedette (en base : `Category.script` et `Category.heroImageUrl`) et la forme de ses cartes (en dur dans `frontend/src/utils/visuals.js`).
- `docs/maquette.html` est la maquette validée par le client (couleurs, typographie, pages, parcours). Elle parle encore d'espèces et de numéro de transaction : ces deux points sont abandonnés pour le paiement des plats, ne pas les reprendre (les espèces existent seulement pour les frais de livraison, payés au livreur).

## Règles

- **Ne jamais tester sur la base de production.** Les essais, migrations et serveurs locaux utilisent seulement la branche Neon « dev ». Avant tout essai, regarder le nom du serveur dans `backend/.env` (afficher seulement le nom du serveur, jamais l'adresse complète ni le mot de passe). S'il s'agit du serveur de production, ou en cas de doute, prévenir le client et s'arrêter. Serveurs Neon (vérifiés par le client le 5 octobre 2026) : **dev** = `ep-nameless-band-b4vetndd` (seul autorisé en local) ; **production** = `ep-damp-lab-b44k8hrf` (Render seulement, jamais en local).
- **Ne jamais afficher `DATABASE_URL` ni `DIRECT_URL`, même en partie** (pas de `grep`, `cat` ou `sed` sur ces lignes de `backend/.env`, ni dans les journaux) : seulement le nom du serveur (ex. `ep-nameless-band-b4vetndd`), lu par un petit script qui découpe l'adresse (`new URL(...).hostname.split('.')[0]`) et n'imprime rien d'autre. Le 10 octobre 2026, une commande mal filtrée a affiché l'adresse complète de dev dans la conversation ; le client a changé les mots de passe Neon de dev et de production.
- **Règle absolue Prisma (depuis le 9 octobre 2026, la base dev a été vidée par erreur ce jour-là) :**
  - ne **jamais** donner l'adresse d'une vraie base (dev ou production) à Prisma comme base de brouillon (`--shadow-database-url`, `shadowDatabaseUrl`) : Prisma la vide ;
  - ne **jamais** lancer `prisma migrate dev`, `prisma migrate reset` ni `prisma db push`, ni sur dev ni sur production ;
  - les migrations s'écrivent sans base (`prisma migrate diff --from-schema-datamodel … --to-schema-datamodel … --script`), puis s'appliquent avec `npm run db:deploy` ;
  - **avant toute commande Prisma qui écrit dans une base** (`db:deploy`, `migrate resolve`, `db:seed`, `db execute`…), dire au client laquelle et pourquoi, et attendre son accord.
- Les prix sont toujours calculés par le serveur. Le frontend n'envoie jamais de prix.
- Ne pas modifier le schéma Prisma ou l'API sans le signaler clairement.
- Le seed ne doit **jamais** écraser une base remplie : chaque déploiement Render le lance, et il effacerait les changements de l'équipe (prix, photos, disponibilité). Pour corriger le menu en ligne, passer par l'espace équipe (ou une migration de données signalée), pas par `menu-data.js`.
- Droits du menu : la disponibilité d'un plat (un clic) est ouverte au PATRON et à l'OPERATEUR ; tout le reste (prix, création, modification, suppression, photos, catégories, accueil) est réservé au PATRON, vérifié par l'API.
- Paiement : uniquement Orange Money, Moov Money ou Telecel Money (`TELECEL_MONEY`, migration `20261006120000_telecel_money`), payé avant la livraison, par **code marchand** (USSD) du compte « ECOFOOD », sans frais, jamais sur un numéro. Codes avec `MONTANT` dans les réglages Render (`ORANGE_MONEY_CODE`, `MOOV_MONEY_CODE`, `TELECEL_MONEY_CODE`, `MERCHANT_NAME`, vides = codes officiels dans `backend/src/config/env.js`), lus par le site via `GET /api/payment` (`frontend/src/utils/payment.js`, bouton « Payer maintenant » en `tel:` avec `%23`, et « Copier le code »). Jamais de code écrit en dur dans le site. Plus d'espèces : `ESPECES` reste dans l'enum Prisma (pas de migration) mais l'API le refuse, et le site n'en parle nulle part.
- Client prévenu à chaque étape : un seul bouton par étape enregistre l'étape et ouvre WhatsApp avec le message ; l'étape suivante est refusée par l'API tant que l'agent n'a pas confirmé l'envoi (« Oui, envoyé » ou « Client prévenu par appel », événements `MESSAGE_ENVOYE` / `CLIENT_APPELE`). L'annulation reste toujours possible. Rien n'est demandé quand `WHATSAPP_CUSTOMER_AUTO=1`. Règles dans `noticeState()` de `backend/src/services/customer-messages.js`.
- Frais de livraison : calculés par le serveur avec la grille du Patron (quartier ou distance, 0 F possible = livraison offerte, figés dans la commande), sinon saisis par l'équipe (toujours au moins 1 F) selon le quartier, indiqués au client avant la livraison (messages et page de suivi), payés **au livreur à la réception**, en espèces ou par mobile money avec le code marchand (montant des frais rempli), au choix du client. Phrase unique : « Frais de livraison : X F, à payer au livreur à la réception, en espèces ou par mobile money avec le code marchand (sans frais, nom affiché : ECOFOOD) : » puis un code par ligne, entre trois accents graves (sinon WhatsApp met les `*` en gras et les efface) ; retours à la ligne dans le modèle, jamais dans les valeurs. » (`feeSentence` dans `customer-messages.js`). Commande avec un supplément de nuit (lot 3) : X F devient « 1 500 F (dont 500 F de supplément de nuit) », écrit dans la valeur de la variable du montant (`feeWithNight`), donc mêmes modèles Meta, rien à refaire approuver. Livraison offerte (0 F) : « Livraison offerte : vous n’avez rien à payer au livreur. » à la place de cette phrase, sans codes marchands, et rien à encaisser par le livreur. Correction des frais : motif obligatoire (événement `FRAIS_CORRIGES`), Patron et Opérateur jusqu'au départ du livreur, Patron seulement ensuite, plus du tout une fois les frais vérifiés ou remis (`feeEditRight()` dans `delivery-fees.js`). Le départ du livreur demande seulement des frais saisis. À la remise, le mode de paiement des frais est obligatoire (vérifié par l'API), sauf livraison offerte. Mobile money : vérifié par l'équipe sur le téléphone marchand ; espèces : remises par le livreur au restaurant (« Espèces remises »).
- Mobile money : le client donne seulement le numéro qui a payé, plus de numéro de transaction. L'équipe vérifie le paiement avec ce numéro et le montant. La colonne `paymentReference` (et sa contrainte unique) reste en base, vide, en attendant une future migration qui la supprimera.
- Livrées · à remercier : une commande livrée (code du livreur ou validation sans code) y reste tant que le remerciement (message `LIVREE`) n'est pas confirmé, puis passe dans l'Historique ; vide avec `WHATSAPP_CUSTOMER_AUTO=1`. Seules les livraisons depuis `THANKS_SINCE` (5 octobre 2026) comptent. Notification « Commande … livrée par … à … » au Patron et aux Opérateurs. Règles : `needsThanks()` / `thanksWhere()` dans `backend/src/services/customer-messages.js`.
- Livreur : ne voit que ses courses du jour et, comme seul montant, les frais de livraison à encaisser ; jamais le total des plats, le paiement des plats ni le code de remise (vérifié par l'API). Le code n'apparaît jamais sur la page de suivi publique, seulement dans le message WhatsApp « en route » et dans l'espace équipe.
- Statuts de commande : `PAIEMENT_A_VERIFIER` (départ de toute nouvelle commande) → `PAYEE` → `EN_PREPARATION` → `EN_LIVRAISON` → `LIVREE`, et `ANNULEE` (motif obligatoire) à tout moment avant `LIVREE`. Livraison en mode Prestataire (lot 5c) : `EN_PREPARATION` → `PRETE_LIVRAISON` (« Prête pour livraison », posée par l'équipe du restaurant sans message, affichée « En préparation » au client) → `EN_LIVRAISON` à « Commande récupérée » (par le livreur, ou par l'agent ou le Responsable livraison avec un motif) → `LIVREE` ; règles dans `backend/src/services/dispatch.js`. À emporter (`Order.mode = A_EMPORTER`) : `EN_PREPARATION` → `PRETE` → `LIVREE` (affichée « Retirée »), sans frais ni livreur ni position, payé par code marchand comme la livraison ; messages `PAIEMENT_CONFIRME_EMPORTER`, `EN_PREPARATION_EMPORTER`, `COMMANDE_PRETE` (« Kamsonghin, en face de Sonia Hôtel » + lien Itinéraire, `RESTAURANT_ADDRESS` / `RESTAURANT_MAPS_URL`), `RETIREE`. Migration `20261006150000_a_emporter`. Voir README « À emporter ». Code de retrait à 4 chiffres créé au passage `PRETE`, envoyé dans le message « commande prête », tapé par l'agent au comptoir (5 codes faux au plus) ; client sans code : motif obligatoire (`RETRAIT_SANS_CODE`) ; jamais sur la page de suivi publique (`checkPickupCode()` dans `courier.js`, migration `20261007120000_code_retrait`). Une étape à la fois, jamais de retour en arrière. Les frais de livraison sont donnés en confirmant le paiement (`PAYEE`) ; « Lancer la préparation » fait passer `PAYEE` → `EN_PREPARATION`. `PAYEE` est toujours posé à la main par l'équipe après vérification sur le téléphone marchand, jamais automatiquement. Chaque changement est enregistré dans `OrderStatusChange` (qui, quand, motif). Règles dans `backend/src/services/order-status.js`.
- Travailler étape par étape et vérifier que ça tourne avant de passer à la suite.

## Feuille de route

- Chantier en 10 lots (parcours court et bon de commande, prise de commande par l'agent, supplément de nuit, compte Prestataire, livraison en deux modes, ventes, avis, FR/EN, WhatsApp automatique, Play Store) et sa règle absolue (on ajoute sans rien casser, chaque nouveauté derrière un réglage éteint par défaut, STOP avant chaque mise en ligne) : voir `docs/feuille-de-route.md`, à tenir à jour lot par lot.

## Points en attente du client

- Prix des Fuego Wings 8 pièces à la carte (10 000 F sur le visuel, plus cher que le menu N° 30 à 9 500 F).
- Vraies descriptions des burgers.
- Alerte WhatsApp à l'équipe : application Meta, modèle `nouvelle_commande` approuvé, variables WhatsApp sur Render (README « Alerte WhatsApp à l'équipe »).
- Avant de remettre l'application à Belchicken (commandes d'essai à supprimer en production, Render Starter, comptes, grille des frais, formation) : `docs/feuille-de-route.md`, « Avant la livraison à Belchicken ».
