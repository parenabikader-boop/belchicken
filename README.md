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
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      Menu, commandes, journal WhatsApp
│   │   ├── menu-data.js       Menu officiel (44 produits, N° 1 à 31 + extras)
│   │   └── seed.js            Charge le menu en base (idempotent)
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
npm run db:seed             # charge le menu
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

## Démarrer le projet en local

Une fois l'installation faite, une seule commande à la racine du projet démarre le backend et le frontend ensemble :

```bash
npm install     # la première fois seulement, à la racine
npm run dev
```

- API : `http://localhost:3006`
- Site : `http://localhost:5173`

Les messages des deux serveurs s'affichent dans le même terminal, préfixés par `[api]` et `[site]`. `Ctrl+C` arrête les deux. Si l'un des deux plante au démarrage (port déjà pris, base injoignable…), l'autre s'arrête aussi. Le backend redémarre tout seul quand un fichier change, et le site se met à jour dans le navigateur.

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

## Déploiement du backend sur Render

- Root Directory : `backend`
- Build Command : `npm install && npx prisma migrate deploy`
- Start Command : `npm start`
- Variables : celles de `.env.example`, avec `NODE_ENV=production` et `CORS_ORIGINS` égal à l'URL Vercel du frontend.
- Après le premier déploiement, chargez le menu une fois depuis le Shell Render : `npm run db:seed`.

## Menu

Le menu est défini dans `backend/prisma/menu-data.js`. Pour changer un prix ou ajouter un plat, modifiez ce fichier puis relancez `npm run db:seed`. Le seed met à jour sans créer de doublons et ne touche pas à la disponibilité des plats.

Point à confirmer : Fuego Wings 8 pièces à la carte, affiché à 10 000 F, plus cher que le menu N° 30 à 9 500 F.
