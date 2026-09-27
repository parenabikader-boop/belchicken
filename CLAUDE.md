# Belchicken · Commande en ligne

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

- `backend/` est fait et testé (`npm test`) : menu, création de commande, alerte WhatsApp. Voir `README.md` pour l'API.
- `backend/prisma/menu-data.js` contient le menu officiel complet. Ne pas inventer de plats ni de prix.
- `frontend/public/menu/` contient les photos des plats.
- `docs/maquette.html` est la maquette validée par le client. Le frontend doit la reproduire fidèlement (couleurs, typographie Public Sans, pages, parcours).

## Prochaine tâche : le frontend

Créer `frontend/` en React + Vite qui reproduit `docs/maquette.html` et se branche sur l'API :

1. Pages séparées avec React Router : Accueil `/`, Menu `/menu/:categorie`, Ma commande `/commande`, Vos informations `/valider`, Confirmation `/confirmation/:reference`, Infos pratiques `/infos`.
2. Le menu vient de `GET /api/menu` (plus de données en dur). Les plats indisponibles sont grisés et ne peuvent pas être ajoutés.
3. Panier dans un contexte React, sauvegardé dans localStorage pour survivre à un rechargement.
4. Envoi avec `POST /api/orders` (format dans README.md). Afficher les erreurs de l'API telles quelles, elles sont déjà en français.
5. Page de confirmation rechargeable via `GET /api/orders/:reference`.
6. URL de l'API dans `VITE_API_URL` (`.env.example` à fournir).
7. Mobile d'abord : la plupart des clients commandent depuis leur téléphone.

## Règles

- Les prix sont toujours calculés par le serveur. Le frontend n'envoie jamais de prix.
- Ne pas modifier le schéma Prisma ou l'API sans le signaler clairement.
- Travailler étape par étape et vérifier que ça tourne avant de passer à la suite.

## Points en attente du client

- Prix des Fuego Wings 8 pièces à la carte (10 000 F sur le visuel, plus cher que le menu N° 30 à 9 500 F).
- Vraies descriptions des burgers, adresse du restaurant, numéros WhatsApp et marchand définitifs.
