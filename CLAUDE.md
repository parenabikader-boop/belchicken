# Belchicken · Commande en ligne

**Toujours répondre au client en français, avec des explications simples, sans jargon.**

Site de commande en ligne du restaurant Belchicken (Bobo-Dioulasso, Burkina Faso).
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
- Espace équipe commencé : connexion (rôles PATRON / OPERATEUR, `npm run equipe:patron`), pages sous `/equipe` (`frontend/src/staff/`, chargées à part), API sous `/api/staff` protégée par `requireStaff()`. Page Commandes faite (liste mise à jour toutes les 5 s, son et badge, filtres, recherche, détail, changement de statut). Page Menu faite (`frontend/src/staff/menu/`) : disponibilité en un clic pour toute l'équipe ; fiches plat et catégorie, ordre, suppression ou retrait du menu pour le Patron. Photos des plats, photos vedettes des catégories et 3 photos de l'accueil (page Accueil, `/equipe/accueil`) envoyées sur Cloudinary (téléphone : appareil photo ou galerie, aperçu, recadrage, réduction dans le navigateur). Reste : le tableau de bord. Voir README.md.
- `backend/prisma/menu-data.js` contient le menu de départ complet. Ne pas inventer de plats ni de prix. Il ne sert qu'à remplir une base vide : `seed.js` ne fait rien dès qu'un plat existe. La base fait foi pour le menu.
- Cloudinary configuré (`src/lib/cloudinary.js`, `npm run cloudinary:check`). Clés dans `backend/.env` et sur Render, jamais dans le code ni la conversation.
- Photos : plats dans `frontend/public/menu/` (provisoires, de mauvaise qualité), accueil dans `frontend/public/accueil/`, logo dans `frontend/public/brand/`. Sources dans `docs/photos/` et `docs/`.
- Une seule ambiance sur tout le site (fond crème, rouge Belchicken, brun foncé) : le client ne veut pas de couleur par catégorie. Chaque catégorie du menu se distingue par son petit titre, sa photo vedette (en base : `Category.script` et `Category.heroImageUrl`) et la forme de ses cartes (en dur dans `frontend/src/utils/visuals.js`).
- `docs/maquette.html` est la maquette validée par le client (couleurs, typographie, pages, parcours). Elle parle encore d'espèces et de numéro de transaction : ces deux points sont abandonnés, ne pas les reprendre.

## Règles

- Les prix sont toujours calculés par le serveur. Le frontend n'envoie jamais de prix.
- Ne pas modifier le schéma Prisma ou l'API sans le signaler clairement.
- Le seed ne doit **jamais** écraser une base remplie : chaque déploiement Render le lance, et il effacerait les changements de l'équipe (prix, photos, disponibilité). Pour corriger le menu en ligne, passer par l'espace équipe (ou une migration de données signalée), pas par `menu-data.js`.
- Droits du menu : la disponibilité d'un plat (un clic) est ouverte au PATRON et à l'OPERATEUR ; tout le reste (prix, création, modification, suppression, photos, catégories, accueil) est réservé au PATRON, vérifié par l'API.
- Paiement : uniquement Orange Money ou Moov Money, payé avant la livraison. Plus d'espèces : `ESPECES` reste dans l'enum Prisma (pas de migration) mais l'API le refuse, et le site n'en parle nulle part.
- Mobile money : le client donne seulement le numéro qui a payé, plus de numéro de transaction. L'équipe vérifie le paiement avec ce numéro et le montant. La colonne `paymentReference` (et sa contrainte unique) reste en base, vide, en attendant une future migration qui la supprimera.
- Statuts de commande : `PAIEMENT_A_VERIFIER` (départ de toute nouvelle commande) → `PAYEE` → `EN_PREPARATION` → `EN_LIVRAISON` → `LIVREE`, et `ANNULEE` (motif obligatoire) à tout moment avant `LIVREE`. Une étape à la fois, jamais de retour en arrière. `PAYEE` est toujours posé à la main par l'équipe après vérification sur le téléphone marchand, jamais automatiquement. Chaque changement est enregistré dans `OrderStatusChange` (qui, quand, motif). Règles dans `backend/src/services/order-status.js`.
- Travailler étape par étape et vérifier que ça tourne avant de passer à la suite.

## Points en attente du client

- Prix des Fuego Wings 8 pièces à la carte (10 000 F sur le visuel, plus cher que le menu N° 30 à 9 500 F).
- Vraies descriptions des burgers, adresse du restaurant, numéros WhatsApp et marchand définitifs.

## Prochaines étapes

### Ordre global

1. Mise en ligne : backend sur Render, frontend sur Vercel (voir README.md).
2. Alerte WhatsApp : application Meta, modèle `nouvelle_commande` approuvé, variables WhatsApp sur Render.
3. Espace équipe (cahier des charges ci-dessous).
4. Vraies informations du restaurant : adresse, numéros WhatsApp et marchand, horaires, descriptions des burgers, prix des Fuego Wings 8 pièces.
5. Préparation de l'ouverture : vider les commandes de test (dont `BC-K98QKH`, client « TEST Claude (à supprimer) »), changer le mot de passe Neon et mettre à jour `DATABASE_URL` sur Render.

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
