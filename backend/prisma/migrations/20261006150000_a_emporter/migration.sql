-- À emporter : le client retire sa commande au restaurant (sans frais de livraison ni livreur).
-- Ajouts seuls : les commandes existantes restent en livraison (valeur par défaut).

-- Nouveau statut : prête à retirer
ALTER TYPE "OrderStatus" ADD VALUE 'PRETE';

-- Livraison ou à emporter
CREATE TYPE "FulfillmentMode" AS ENUM ('LIVRAISON', 'A_EMPORTER');
ALTER TABLE "Order" ADD COLUMN "mode" "FulfillmentMode" NOT NULL DEFAULT 'LIVRAISON';
