# Belchicken · Commande en ligne

**Toujours répondre au client en français, avec des explications simples, sans jargon.**

Site de commande en ligne du restaurant Belchicken Burkina (Ouagadougou, Burkina Faso). Kamsonghin, en face de Sonia Hôtel ; Plus Code 9F2J+V8 Ouagadougou (12.352187, -1.519188) ; WhatsApp du call center (commandes, suivi, boutons « Nous contacter sur WhatsApp ») +226 05 23 48 48 ; numéro du restaurant (contact, tickets de caisse) +226 62 88 42 88 ; ouvert du dimanche au jeudi 6 h – 23 h, vendredi et samedi 24 h/24. Nom affiché « Belchicken Burkina », le logo et « Belchicken » restent tels quels. Jamais de boîte postale (11 BP 4928). Toutes ces informations sont dans `frontend/src/restaurant.js` (site) et `backend/src/config/env.js` (messages).
Le client choisit ses plats, indique son paiement et sa position, puis valide.
La commande est enregistrée et l'équipe reçoit une alerte WhatsApp.
Le reste (frais de livraison, confirmation, livraison) est géré par le call center, hors de ce projet pour l'instant.

Projet totalement indépendant de TWIA FOOD : aucun code partagé.

## Stack

- backend : Node.js 20+, Express, Prisma 6, PostgreSQL (Neon), Zod. Port 3006. Déploiement Render.
- frontend : React + Vite. Port 5173. Déploiement Vercel.
- Tout le texte visible par les clients est en français.

## État actuel

- `backend/` est fait et testé (`npm test`) : menu, création de commande, alerte WhatsApp, nouveaux essais automatiques pendant le réveil de Neon (`src/lib/db-retry.js`). Voir `README.md` pour l'API.
- `frontend/` est fait : Accueil `/`, Menu `/menu/:categorie`, Ma commande `/commande`, Vos informations `/valider`, Confirmation `/confirmation/:reference`, Infos pratiques `/infos`. Parcours complet testé avec une vraie commande en base.
- `npm run dev` à la racine lance le backend et le frontend ensemble.
- Espace équipe commencé : connexion (rôles PATRON / OPERATEUR, `npm run equipe:patron`), pages sous `/equipe` (`frontend/src/staff/`, chargées à part), API sous `/api/staff` protégée par `requireStaff()`. Page Commandes faite (`frontend/src/staff/orders/OrdersList.jsx`) : une étape à la fois, dans l'ordre du travail (À vérifier, Payées, En préparation, En livraison, Livrées · à remercier, puis Historique avec Livrées / Annulées), chaque étape avec son compteur et la phrase de l'action à faire (`STAGES` dans `labels.js`) ; onglets sur téléphone, les 4 étapes en colonnes sur ordinateur (1024 px et plus) ; à l'ouverture, la première étape qui contient des commandes ; recherche dans toutes les commandes ; mise à jour toutes les 5 s, son et badge ; détail et changement de statut. Page Menu faite (`frontend/src/staff/menu/`) : disponibilité en un clic pour toute l'équipe ; fiches plat et catégorie, ordre, suppression ou retrait du menu pour le Patron. Photos des plats, photos vedettes des catégories et 3 photos de l'accueil (page Accueil, `/equipe/accueil`) envoyées sur Cloudinary (téléphone : appareil photo ou galerie, aperçu, recadrage, réduction dans le navigateur). Tableau de bord fait (`/equipe/tableau-de-bord`, Patron seulement, `frontend/src/staff/dashboard/`). Voir README.md.
- Page Équipe faite (`/equipe/equipe`, Patron seulement, `frontend/src/staff/team/`) : création des comptes Opérateur avec mot de passe provisoire (à changer à la première connexion, bloqué par l'API sinon), mot de passe oublié, désactivation (déconnecte tous ses téléphones), réactivation. Chacun change son propre mot de passe sur `/equipe/mot-de-passe`. Migration `20261004120000_comptes_equipe` (colonne `StaffUser.mustChangePassword`).
- Frais de livraison et suivi client faits : l'équipe saisit les frais (au moins 1 F, selon le quartier) en confirmant le paiement ; le livreur part (`EN_LIVRAISON`) dès qu'ils sont saisis. Bouton « Prévenir le client sur WhatsApp » à chaque étape (lien wa.me, textes dans `backend/src/services/customer-messages.js`, au format des modèles Meta, envoi automatique prêt mais éteint : `WHATSAPP_CUSTOMER_AUTO`). Page de suivi client `/suivi/:reference` (= `/confirmation/:reference`), mise à jour toute seule. Tableau de bord : plats et frais séparés. Migration `20261004150000_frais_livraison_suivi` (`Order.deliveryFee`, table `OrderEvent`). Réglages `PUBLIC_SITE_URL` et `MERCHANT_NUMBER` sur Render.
- Frais payés au livreur faits (6 octobre 2026) : le client paie les frais au livreur à la réception, en espèces ou par mobile money au numéro marchand. Plus de « Frais reçus » : bouton « Lancer la préparation » (`PAYEE` → `EN_PREPARATION`, message `EN_PREPARATION`). Le livreur voit « Frais à encaisser » et, à la remise, tape le code et choisit Espèces / Mobile money (obligatoire, aussi pour l'agent qui valide sans code). Page Caisse (`/equipe/caisse`, Patron et Opérateur, `frontend/src/staff/cash/`) : onglets « Frais à vérifier » (mobile money à cocher après vérification) et « Caisse livreurs » (espèces encore chez chaque livreur, bouton « Espèces remises », historique). Tableau de bord : frais par mode et espèces chez les livreurs. Migration `20261006004212_frais_au_livreur` (`deliveryFeeReceivedAt` renommé `deliveryFeeVerifiedAt`, `Order.deliveryFeeMethod`, `Order.cashRemittanceId`, table `CashRemittance`, événements `FRAIS_VERIFIES` / `FRAIS_NON_VERIFIES`). Règles : `order-status.js` (frais) et `cash.js` (caisse). Textes des modèles Meta à soumettre : README.md.
- Espace livreur fait : rôle `LIVREUR` créé par le Patron (page Équipe), pages `/equipe/courses` (`frontend/src/staff/courier/`), API `/api/staff/courses`. L'agent choisit le livreur au passage `EN_LIVRAISON` (remplaçable pendant la livraison) ; un code de remise à 4 chiffres part dans le message « en route » ; le livreur le tape pour passer la commande `LIVREE` (5 codes faux au plus) ; client sans code : l'agent valide avec un motif. Notifications « Nouvelle course » / « Course annulée » au livreur seulement. Tableau de bord : livraisons et temps moyen par livreur. Migration `20261005110916_espace_livreur` (`Order.courierId`, `courierName`, `courierAssignedAt`, `deliveryCode`, `deliveryCodeAttempts`, `OrderEvent.courierName`). Règles dans `backend/src/services/courier.js`.
- Application installable (PWA), deux applications : « Belchicken » (`public/manifest.webmanifest`, tout le site) et « Belchicken Équipe » (`public/equipe.webmanifest`, sous `/equipe`, icône avec badge « ÉQUIPE ») ; le choix se fait dans `index.html`. Service worker `public/sw.js` (actif seulement après `npm run build`) : garde le code du site, les photos et les polices, **jamais** `/api/...` ni les pages ; hors ligne, page `public/hors-ligne.html`. Bandeau d'installation `src/components/InstallBanner.jsx` (Android : bouton ; iPhone : guide), refermé pour 5 jours.
- Alertes sur téléphone pour l'équipe (Web Push) : page `/equipe/alertes`, table `PushSubscription`, `src/services/push.service.js`, gestion `push` et `notificationclick` dans `public/sw.js`. Clés VAPID dans `backend/.env` et sur Render, jamais dans le code ni la conversation.
- `backend/prisma/menu-data.js` contient le menu de départ complet. Ne pas inventer de plats ni de prix. Il ne sert qu'à remplir une base vide : `seed.js` ne fait rien dès qu'un plat existe. La base fait foi pour le menu.
- Cloudinary configuré (`src/lib/cloudinary.js`, `npm run cloudinary:check`). Clés dans `backend/.env` et sur Render, jamais dans le code ni la conversation.
- Photos : plats dans `frontend/public/menu/` (provisoires, de mauvaise qualité), accueil dans `frontend/public/accueil/`, logo dans `frontend/public/brand/`. Sources dans `docs/photos/` et `docs/`.
- Une seule ambiance sur tout le site (fond crème, rouge Belchicken, brun foncé) : le client ne veut pas de couleur par catégorie. Chaque catégorie du menu se distingue par son petit titre, sa photo vedette (en base : `Category.script` et `Category.heroImageUrl`) et la forme de ses cartes (en dur dans `frontend/src/utils/visuals.js`).
- `docs/maquette.html` est la maquette validée par le client (couleurs, typographie, pages, parcours). Elle parle encore d'espèces et de numéro de transaction : ces deux points sont abandonnés pour le paiement des plats, ne pas les reprendre (les espèces existent seulement pour les frais de livraison, payés au livreur).

## Règles

- **Ne jamais tester sur la base de production.** Les essais, migrations et serveurs locaux utilisent seulement la branche Neon « dev ». Avant tout essai, regarder le nom du serveur dans `backend/.env` (afficher seulement le nom du serveur, jamais l'adresse complète ni le mot de passe). S'il s'agit du serveur de production, ou en cas de doute, prévenir le client et s'arrêter. Serveurs Neon (vérifiés par le client le 5 octobre 2026) : **dev** = `ep-nameless-band-b4vetndd` (seul autorisé en local) ; **production** = `ep-damp-lab-b44k8hrf` (Render seulement, jamais en local).
- Les prix sont toujours calculés par le serveur. Le frontend n'envoie jamais de prix.
- Ne pas modifier le schéma Prisma ou l'API sans le signaler clairement.
- Le seed ne doit **jamais** écraser une base remplie : chaque déploiement Render le lance, et il effacerait les changements de l'équipe (prix, photos, disponibilité). Pour corriger le menu en ligne, passer par l'espace équipe (ou une migration de données signalée), pas par `menu-data.js`.
- Droits du menu : la disponibilité d'un plat (un clic) est ouverte au PATRON et à l'OPERATEUR ; tout le reste (prix, création, modification, suppression, photos, catégories, accueil) est réservé au PATRON, vérifié par l'API.
- Paiement : uniquement Orange Money ou Moov Money, payé avant la livraison. Plus d'espèces : `ESPECES` reste dans l'enum Prisma (pas de migration) mais l'API le refuse, et le site n'en parle nulle part.
- Client prévenu à chaque étape : un seul bouton par étape enregistre l'étape et ouvre WhatsApp avec le message ; l'étape suivante est refusée par l'API tant que l'agent n'a pas confirmé l'envoi (« Oui, envoyé » ou « Client prévenu par appel », événements `MESSAGE_ENVOYE` / `CLIENT_APPELE`). L'annulation reste toujours possible. Rien n'est demandé quand `WHATSAPP_CUSTOMER_AUTO=1`. Règles dans `noticeState()` de `backend/src/services/customer-messages.js`.
- Frais de livraison : toujours au moins 1 F, saisis par l'équipe selon le quartier, indiqués au client avant la livraison (messages et page de suivi), payés **au livreur à la réception**, en espèces ou par Orange Money / Moov Money au numéro marchand, au choix du client. Phrase unique : « Frais de livraison : X F, à payer au livreur à la réception, en espèces ou par Orange Money / Moov Money au [numéro marchand]. » (`feeSentence` dans `customer-messages.js`). Le départ du livreur demande seulement des frais saisis. À la remise, le mode de paiement des frais est obligatoire (vérifié par l'API). Mobile money : vérifié par l'équipe sur le téléphone marchand ; espèces : remises par le livreur au restaurant (« Espèces remises »).
- Mobile money : le client donne seulement le numéro qui a payé, plus de numéro de transaction. L'équipe vérifie le paiement avec ce numéro et le montant. La colonne `paymentReference` (et sa contrainte unique) reste en base, vide, en attendant une future migration qui la supprimera.
- Livrées · à remercier : une commande livrée (code du livreur ou validation sans code) y reste tant que le remerciement (message `LIVREE`) n'est pas confirmé, puis passe dans l'Historique ; vide avec `WHATSAPP_CUSTOMER_AUTO=1`. Seules les livraisons depuis `THANKS_SINCE` (5 octobre 2026) comptent. Notification « Commande … livrée par … à … » au Patron et aux Opérateurs. Règles : `needsThanks()` / `thanksWhere()` dans `backend/src/services/customer-messages.js`.
- Livreur : ne voit que ses courses du jour et, comme seul montant, les frais de livraison à encaisser ; jamais le total des plats, le paiement des plats ni le code de remise (vérifié par l'API). Le code n'apparaît jamais sur la page de suivi publique, seulement dans le message WhatsApp « en route » et dans l'espace équipe.
- Statuts de commande : `PAIEMENT_A_VERIFIER` (départ de toute nouvelle commande) → `PAYEE` → `EN_PREPARATION` → `EN_LIVRAISON` → `LIVREE`, et `ANNULEE` (motif obligatoire) à tout moment avant `LIVREE`. Une étape à la fois, jamais de retour en arrière. Les frais de livraison sont donnés en confirmant le paiement (`PAYEE`) ; « Lancer la préparation » fait passer `PAYEE` → `EN_PREPARATION`. `PAYEE` est toujours posé à la main par l'équipe après vérification sur le téléphone marchand, jamais automatiquement. Chaque changement est enregistré dans `OrderStatusChange` (qui, quand, motif). Règles dans `backend/src/services/order-status.js`.
- Travailler étape par étape et vérifier que ça tourne avant de passer à la suite.

## Points en attente du client

- Prix des Fuego Wings 8 pièces à la carte (10 000 F sur le visuel, plus cher que le menu N° 30 à 9 500 F).
- Vraies descriptions des burgers, numéros marchands Orange Money et Moov Money définitifs (provisoires : +226 70 00 00 00, dans `frontend/src/restaurant.js` et `backend/src/config/env.js`).

## Prochaines étapes

### Ordre global

1. Mise en ligne : backend sur Render, frontend sur Vercel (voir README.md).
2. Alerte WhatsApp : application Meta, modèle `nouvelle_commande` approuvé, variables WhatsApp sur Render.
3. Espace équipe (cahier des charges ci-dessous).
4. Vraies informations du restaurant : adresse, téléphone et horaires faits (6 octobre 2026). Numéros WhatsApp et du restaurant faits. Restent : numéros marchands, descriptions des burgers, prix des Fuego Wings 8 pièces.
5. Préparation de l'ouverture : commandes de test de la base production vidées le 2 octobre 2026 (9 commandes) ; la commande d'essai depuis le téléphone sera à supprimer aussi. Reste : changer le mot de passe Neon et mettre à jour `DATABASE_URL` sur Render.

### Espace équipe : cahier des charges

Pages réservées à l'équipe, protégées par connexion, jamais visibles des clients ni liées depuis le site public.
Ordre de construction : connexion, commandes, menu et photos, tableau de bord.

1. **Connexion sécurisée.** Comptes à confirmer par le client : probablement un rôle **Patron** (tout) et un rôle **Opérateur** (commandes seulement, sans chiffre d'affaires ni modification des prix). Les droits sont vérifiés par l'API, pas seulement masqués dans les pages.
2. **Commandes.**
   - Liste en temps réel, avec une alerte à chaque nouvelle commande.
   - Détail complet : client, téléphone, plats, total, numéro ayant payé, lien Google Maps de la position, repères.
   - Statut modifiable (fait) : voir les statuts dans « Règles ».
   - Recherche par référence, nom ou téléphone.
3. **Menu et photos.**
   - Créer, modifier et supprimer plats et catégories : nom, numéro, description, composition, prix, formules, petit titre, ordre. Le petit titre et la photo vedette des catégories passent alors de `visuals.js` à la base.
   - Disponibilité d'un plat en un clic.
   - Changer les photos des plats, les 3 photos de l'accueil et la photo vedette de chaque catégorie.
   - Photos stockées sur Cloudinary, pas sur Render (son disque est effacé à chaque déploiement), et redimensionnées automatiquement. Les photos actuelles sont provisoires et de mauvaise qualité.
4. **Tableau de bord.**
   - Commandes et chiffre d'affaires par jour, semaine et mois.
   - Plats et catégories les plus vendus.
   - Heures et jours de pointe.
   - Répartition Orange Money / Moov Money.
   - Panier moyen.
   - Commandes annulées.
