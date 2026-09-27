# Belchicken · Commande en ligne

Site de commande en ligne de Belchicken. Le client choisit ses plats, indique son paiement et sa position, puis valide. La commande est enregistrée et l'équipe reçoit une alerte WhatsApp.

Projet indépendant de TWIA FOOD : aucun code partagé.

| Partie   | Stack                               | Déploiement | Port local |
|----------|-------------------------------------|-------------|------------|
| backend  | Node.js, Express, Prisma 6, Zod      | Render      | 3006       |
| frontend | React, Vite (étape suivante)         | Vercel      | 5173       |
| base     | PostgreSQL                           | Neon        | –          |

## Structure

```
belchicken/
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

## API

### `GET /api/menu`

Catégories actives dans l'ordre du menu, avec leurs sous-groupes, produits et variantes. Chaque produit a au moins une variante, qui porte le prix (Menu / Seul, Taille L / XL, 4 pièces…). Les produits indisponibles sont renvoyés avec `isAvailable: false` pour être affichés grisés.

### `POST /api/orders`

```json
{
  "customer": { "name": "Awa Ouédraogo", "phone": "76 12 34 56" },
  "payment": { "method": "ORANGE_MONEY", "payerPhone": "76123456", "reference": "PP260926.1432.A58213" },
  "location": { "latitude": 11.1771, "longitude": -4.2979, "accuracy": 15 },
  "addressNote": "Secteur 22, portail bleu après la pharmacie",
  "items": [
    { "productId": "…", "variantId": "…", "quantity": 2, "note": "Sans oignon" },
    { "productId": "…", "variantId": "…", "quantity": 1, "choice": "Frit" }
  ]
}
```

- `payment.method` : `ORANGE_MONEY`, `MOOV_MONEY` ou `ESPECES`. Pour le mobile money, `payerPhone` et `reference` sont obligatoires.
- Il faut `location` ou `addressNote` (5 caractères minimum), ou les deux.
- Les prix sont recalculés côté serveur à partir de la base. Le client n'envoie jamais de prix.
- Réponse `201` : `{ order: { reference: "BC-7K2Q9M", status, createdAt, itemsTotal, items } }`.

Erreurs, toujours au format `{ error: { code, message, details } }` avec un message en français affichable tel quel :

| Code HTTP | code                          | Cas                                   |
|-----------|-------------------------------|---------------------------------------|
| 400       | `DONNEES_INVALIDES`           | Champ manquant ou invalide            |
| 409       | `PRODUIT_INDISPONIBLE`        | Plat passé en indisponible entre-temps |
| 409       | `TRANSACTION_DEJA_UTILISEE`   | Référence mobile money déjà utilisée  |
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

Le paramètre {{6}} contient un lien Google Maps quand le client a partagé sa position, suivi de ses repères.

## Déploiement du backend sur Render

- Root Directory : `backend`
- Build Command : `npm install && npx prisma migrate deploy`
- Start Command : `npm start`
- Variables : celles de `.env.example`, avec `NODE_ENV=production` et `CORS_ORIGINS` égal à l'URL Vercel du frontend.
- Après le premier déploiement, chargez le menu une fois depuis le Shell Render : `npm run db:seed`.

## Menu

Le menu est défini dans `backend/prisma/menu-data.js`. Pour changer un prix ou ajouter un plat, modifiez ce fichier puis relancez `npm run db:seed`. Le seed met à jour sans créer de doublons et ne touche pas à la disponibilité des plats.

Point à confirmer : Fuego Wings 8 pièces à la carte, affiché à 10 000 F, plus cher que le menu N° 30 à 9 500 F.
