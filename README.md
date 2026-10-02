# Belchicken · Commande en ligne

Site de commande en ligne de Belchicken. Le client choisit ses plats, indique son paiement et sa position, puis valide. La commande est enregistrée et l'équipe reçoit une alerte WhatsApp.

Projet indépendant de TWIA FOOD : aucun code partagé.

| Partie   | Stack                               | Déploiement | Port local |
|----------|-------------------------------------|-------------|------------|
| backend  | Node.js, Express, Prisma 6, Zod      | Render      | 3006       |
| frontend | React, Vite, React Router            | Vercel      | 5173       |
| base     | PostgreSQL                           | Neon        | –          |

## Structure

```
belchicken/
├── package.json               npm run dev : backend + frontend ensemble
├── scripts/ensure-deps.js     Installe les dépendances manquantes avant npm run dev
├── scripts/check-ports.js     Vérifie que les ports 3006 et 5173 sont libres
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      Menu, commandes, journal WhatsApp
│   │   ├── menu-data.js       Menu de départ (44 produits, N° 1 à 31 + extras)
│   │   └── seed.js            Remplit une base vide avec ce menu (ne touche jamais une base déjà remplie)
│   ├── src/
│   │   ├── config/env.js
│   │   ├── lib/prisma.js
│   │   ├── routes/            menu.routes.js, order.routes.js
│   │   ├── services/          menu, order, pricing, whatsapp
│   │   ├── validators/        order.schema.js (Zod)
│   │   ├── middlewares/       errors.js
│   │   ├── utils/             phone, reference, format, AppError
│   │   ├── app.js
│   │   └── server.js
│   └── test/                  Tests unitaires (node --test)
└── frontend/
    └── public/menu/           Photos des plats
```

## Installation locale

1. Créez une base sur Neon et récupérez deux URL : l'URL poolée (`-pooler`) et l'URL directe.
2. Configurez le backend :

```bash
cd backend
cp .env.example .env        # renseignez DATABASE_URL et DIRECT_URL
npm install                 # lance aussi prisma generate
npx prisma migrate dev --name init
npm run db:seed             # remplit le menu si la base est vide
npm run cloudinary:check    # vérifie les clés Cloudinary (photos), sans les afficher
npm run dev                 # http://localhost:3006
```

3. Vérifiez : `http://localhost:3006/api/health` puis `http://localhost:3006/api/menu`.

Tests : `npm test`.

4. Installez le frontend :

```bash
cd frontend
npm install
```

Par défaut, le site appelle l'API sur `http://localhost:3006`. Pour une autre adresse, copiez `.env.example` en `.env` et changez `VITE_API_URL`.

## Lancer le site en une commande

Une fois la base configurée (étapes 1 et 2 ci-dessus), depuis la racine du projet :

```bash
npm run dev
```

C'est la seule commande à taper. Au premier lancement, elle installe d'elle-même les dépendances qui manquent (racine, `backend/`, `frontend/`) ; cela prend une minute, puis les lancements suivants sont immédiats.

Quand les deux lignes suivantes apparaissent, le site est prêt :

```
[api] API Belchicken sur http://localhost:3006
[site]   ➜  Local:   http://localhost:5173/
```

Ouvrez alors **http://localhost:5173** dans le navigateur.

- Les messages des deux serveurs s'affichent dans le même terminal, préfixés par `[api]` et `[site]`.
- `Ctrl+C` arrête les deux.
- Le backend redémarre tout seul quand un fichier de `backend/src/` change, et le site se met à jour dans le navigateur.
- Si un serveur plante au démarrage, l'autre s'arrête aussi : lisez le message au-dessus.

« Le port 3006 (ou 5173) est déjà utilisé » : le projet tourne déjà, souvent dans un autre terminal de VS Code. Arrêtez-le avec `Ctrl+C` dans ce terminal, puis relancez `npm run dev`. La commande refuse de démarrer dans ce cas, car le site ne pourrait pas joindre l'API.

On peut toujours lancer une seule partie avec `npm run dev` dans `backend/` ou `frontend/`.

## API

### `GET /api/menu`

Catégories actives dans l'ordre du menu, avec leurs sous-groupes, produits et variantes. Chaque produit a au moins une variante, qui porte le prix (Menu / Seul, Taille L / XL, 4 pièces…). Les produits indisponibles sont renvoyés avec `isAvailable: false` pour être affichés grisés.

### `POST /api/orders`

```json
{
  "customer": { "name": "Awa Ouédraogo", "phone": "76 12 34 56" },
  "payment": { "method": "ORANGE_MONEY", "payerPhone": "76123456" },
  "location": { "latitude": 11.1771, "longitude": -4.2979, "accuracy": 15 },
  "addressNote": "Secteur 22, portail bleu après la pharmacie",
  "items": [
    { "productId": "…", "variantId": "…", "quantity": 2, "note": "Sans oignon" },
    { "productId": "…", "variantId": "…", "quantity": 1, "choice": "Frit" }
  ]
}
```

- `payment.method` : `ORANGE_MONEY` ou `MOOV_MONEY`. Le client paie avant la livraison : les espèces ne sont plus acceptées (la valeur `ESPECES` reste dans l'enum Prisma mais est refusée avec une erreur 400).
- `payment.payerPhone` (le numéro qui a payé) est obligatoire. Il n'y a pas de numéro de transaction : l'équipe vérifie le paiement avec ce numéro et le montant.
- Il faut `location` ou `addressNote` (5 caractères minimum), ou les deux.
- Les prix sont recalculés côté serveur à partir de la base. Le client n'envoie jamais de prix.
- Réponse `201` : `{ order: { reference: "BC-7K2Q9M", status, createdAt, itemsTotal, items } }`.

Erreurs, toujours au format `{ error: { code, message, details } }` avec un message en français affichable tel quel :

| Code HTTP | code                          | Cas                                   |
|-----------|-------------------------------|---------------------------------------|
| 400       | `DONNEES_INVALIDES`           | Champ manquant ou invalide            |
| 409       | `PRODUIT_INDISPONIBLE`        | Plat passé en indisponible entre-temps |
| 429       | `TROP_DE_COMMANDES`           | Plus de 8 commandes en 10 min par IP  |

### `GET /api/orders/:reference`

Récapitulatif public d'une commande (plats, total, statut), sans données de paiement ni position. Sert à réafficher la page de confirmation.

## Alerte WhatsApp à l'équipe

À chaque commande, le serveur envoie un message à chaque numéro de `WHATSAPP_TEAM_NUMBERS` via l'API WhatsApp Cloud de Meta. L'envoi se fait en arrière-plan : un échec n'annule jamais la commande, il est enregistré dans `NotificationLog`. Tant que les variables WhatsApp sont vides, les commandes fonctionnent normalement et l'alerte est simplement ignorée.

Mise en place :

1. Créez une application sur Meta for Developers et ajoutez le produit WhatsApp. Utilisez un numéro dédié au système, différent du WhatsApp actuel du restaurant.
2. Générez un jeton d'accès permanent (utilisateur système) et notez le `Phone number ID`.
3. Créez un modèle de message de catégorie **Utilité**, nommé `nouvelle_commande`, langue français, avec ce corps :

```
Nouvelle commande {{1}}
Client : {{2}}
Plats : {{3}}
Total des plats : {{4}}
Paiement : {{5}}
Livraison : {{6}}
```

4. Une fois le modèle approuvé, renseignez `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` et `WHATSAPP_TEAM_NUMBERS` dans `.env`.

Le paramètre {{5}} indique le moyen de paiement, par exemple « Orange Money depuis +22676123456 ». Le paramètre {{6}} contient un lien Google Maps quand le client a partagé sa position, suivi de ses repères.

## Espace équipe

Pages réservées à l'équipe sous `/equipe` (aucun lien depuis le site public, non indexées).
Connexion par numéro de téléphone et mot de passe ; deux rôles : `PATRON` (tout) et `OPERATEUR`
(commandes et disponibilité des plats, sans chiffre d'affaires ni prix ni menu).

- Créer le compte Patron (ou changer son mot de passe) : `npm run equipe:patron` dans `backend/`.
- API : `POST /api/staff/login`, `POST /api/staff/logout`, `GET /api/staff/me`. Les routes protégées utilisent
  `requireStaff()` (tout compte connecté) ou `requireStaff('PATRON')` (`src/middlewares/staff-auth.js`).
- Session : jeton aléatoire dans un cookie `httpOnly` limité à `/api/staff`, valable 14 jours ; la base ne garde que son empreinte.
  Mots de passe hachés avec scrypt. 8 essais ratés par numéro (20 par adresse IP) toutes les 15 minutes.
- Commandes (Patron et Opérateur) : `GET /api/staff/orders?status=EN_COURS|TOUTES|<statut>&q=<recherche>`,
  `GET /api/staff/orders/:reference`, `POST /api/staff/orders/:reference/status` avec `{ from, to, reason }`.
  `from` est le statut affiché à l'écran : si un collègue l'a changé entre-temps, l'API répond 409 au lieu d'écraser.
- Menu (`/equipe/menu`) : `GET /api/staff/menu` et `PATCH /api/staff/menu/products/:id/availability` `{ isAvailable }`
  pour le Patron et l'Opérateur. Réservé au Patron : `POST /api/staff/menu/products`, `PUT|DELETE /api/staff/menu/products/:id`,
  `POST /api/staff/menu/products/:id/restore`, `POST /api/staff/menu/categories`, `PUT|DELETE /api/staff/menu/categories/:id`,
  `PUT /api/staff/menu/categories/order` et `PUT /api/staff/menu/categories/:id/products/order` avec `{ ids }`.
  Supprimer un plat jamais commandé le supprime ; un plat déjà commandé est retiré du menu (`archivedAt`) et peut être remis.
  Une catégorie ne se supprime que vide ; sinon on la masque (`isActive`). Règles et validations : `src/services/menu-edit.js`.
- Photos (Patron) : `PUT|DELETE /api/staff/menu/products/:id/photo` et `PUT|DELETE /api/staff/menu/categories/:id/photo`.
  Le fichier est envoyé tel quel (`Content-Type: image/jpeg`), 6 Mo au plus, JPEG, PNG ou WebP vérifiés par leur contenu
  (`src/services/photo.service.js`). Le navigateur le réduit d'abord à 1600 px en JPEG, après un recadrage facultatif
  (zoom et déplacement, format 4/3 pour les plats, 3/2 pour les bandeaux) : `frontend/src/staff/menu/PhotoPicker.jsx`.
  Rangées sur Cloudinary dans `<CLOUDINARY_FOLDER>/plats` et `/categories` ; l'ancienne photo est supprimée au remplacement.
  Le site propose plusieurs tailles en WebP/AVIF (`srcset`, `sizedPhoto()` dans `frontend/src/utils/visuals.js`) :
  le téléphone télécharge la petite.
- Photos de l'accueil (Patron) : `GET /api/staff/home`, `PUT /api/staff/home/:slot/photo` (cases 1 à 3, mêmes règles),
  `DELETE /api/staff/home/:slot/photo` remet la photo d'origine (`homePhotos` de `prisma/menu-data.js`).
  Le site les lit avec `GET /api/home` (table `HomePhoto`) ; page `/equipe/accueil` (`frontend/src/staff/home/`).
- Tableau de bord (Patron) : `GET /api/staff/dashboard?period=day|week|month&offset=0|-1|…`, page `/equipe/tableau-de-bord`.
  Chiffre d'affaires = commandes `PAYEE`, `EN_PREPARATION`, `EN_LIVRAISON`, `LIVREE` seulement. La période en cours est comparée
  au même moment de la précédente (aujourd'hui jusqu'à 14 h contre hier jusqu'à 14 h). Heure du Burkina = UTC.
  Calculs dans `src/services/dashboard.js` (testés), lecture en base dans `src/services/dashboard.service.js`.
- Statuts : `PAIEMENT_A_VERIFIER` → `PAYEE` → `EN_PREPARATION` → `EN_LIVRAISON` → `LIVREE`, ou `ANNULEE` avec un motif.
  Historique dans la table `OrderStatusChange`.
- Le site appelle `/api/staff` sur sa propre adresse : Vite relaie vers l'API en local (`vite.config.js`), Vercel en ligne
  (`frontend/vercel.json`, à mettre à jour si l'adresse Render change). Ainsi le cookie n'est pas bloqué par Safari.

## Mise en ligne

Le code est sur GitHub ; Render (API) et Vercel (site) se mettent à jour tout seuls à chaque `git push`.
Ordre : Render d'abord (pour connaître l'adresse de l'API), puis Vercel, puis l'adresse Vercel dans `CORS_ORIGINS` sur Render.

### Deux bases séparées (branches Neon)

- Branche principale de Neon : la base du **vrai site**, utilisée seulement par Render.
- Branche `dev` : copie faite au moment de sa création, utilisée par `backend/.env` sur l'ordinateur.
  Les essais (commandes de test, prix, photos) n'y touchent jamais le vrai site.
- Photos : `CLOUDINARY_FOLDER=belchicken-dev` sur l'ordinateur, `belchicken` sur Render. Le serveur ne supprime
  que les photos de son propre dossier (`ownsPhoto()` dans `src/services/photo.service.js`) : la base `dev` contient
  des photos copiées du vrai site, et les remplacer en local ne les efface pas.

### Backend sur Render

`render.yaml` (à la racine) décrit tout le service : sur Render, **New > Blueprint** puis choisir le dépôt.
Render demande alors seulement :

- `DATABASE_URL` : URL Neon **poolée** (l'hôte contient `-pooler`) ;
- `DIRECT_URL` : URL Neon **directe** (même URL sans `-pooler`), utilisée pour les migrations ;
- `CORS_ORIGINS` : adresse du site Vercel, sans slash final ;
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` : clés Cloudinary pour les photos.
  Si le service existe déjà, ajoutez-les à la main dans **Environment** (Render ne redemande pas les secrets d'un Blueprint déjà créé).

À chaque déploiement, le build applique les migrations (`npm run db:deploy`, qui réessaie si Neon dort) puis lance `npm run db:seed`.
Le seed ne remplit le menu que si la base est **vide** (premier déploiement) ; sinon il ne modifie rien.
Un déploiement n'écrase donc jamais les prix, photos et disponibilités changés dans l'espace équipe. Pas besoin du Shell Render.

Offre gratuite : le service s'endort après 15 minutes sans visite et met jusqu'à une minute à se réveiller. Pour l'ouverture, passer au plan Starter.

### Frontend sur Vercel

- Root Directory : `frontend` (Vercel reconnaît Vite tout seul).
- Variable : `VITE_API_URL` = adresse Render de l'API, sans slash final (ex. `https://belchicken-api.onrender.com`).
- `frontend/vercel.json` renvoie toutes les adresses vers l'application, pour que les liens comme `/menu/burgers` fonctionnent après un rechargement.

## Menu

Le menu se gère depuis l'espace équipe (`/equipe`) : c'est la base qui fait foi.
`backend/prisma/menu-data.js` ne sert plus qu'à remplir une base vide (`npm run db:seed`) : le modifier ne change pas le menu en ligne.

Photos : envoyées par l'API à Cloudinary (dossier `CLOUDINARY_FOLDER`, `belchicken` par défaut), jamais sur le disque de Render
qui est effacé à chaque déploiement. Les photos d'origine restent servies depuis `frontend/public/` tant qu'elles ne sont pas remplacées.

Point à confirmer : Fuego Wings 8 pièces à la carte, affiché à 10 000 F, plus cher que le menu N° 30 à 9 500 F.
