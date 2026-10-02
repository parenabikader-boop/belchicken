-- Nouveaux statuts de commande. Écrite à la main : on RENOMME les valeurs de l'enum
-- au lieu de les supprimer et recréer, pour garder le statut des commandes existantes.
--   EN_ATTENTE -> PAIEMENT_A_VERIFIER (même sens : paiement pas encore vérifié)
--   CONFIRMEE  -> PAYEE
--   + EN_PREPARATION (nouveau, entre PAYEE et EN_LIVRAISON)
ALTER TYPE "OrderStatus" RENAME VALUE 'EN_ATTENTE' TO 'PAIEMENT_A_VERIFIER';
ALTER TYPE "OrderStatus" RENAME VALUE 'CONFIRMEE' TO 'PAYEE';
ALTER TYPE "OrderStatus" ADD VALUE 'EN_PREPARATION' AFTER 'PAYEE';

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PAIEMENT_A_VERIFIER';

-- Historique des statuts
CREATE TABLE "OrderStatusChange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "reason" TEXT,
    "staffUserId" TEXT,
    "staffName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderStatusChange_orderId_createdAt_idx" ON "OrderStatusChange"("orderId", "createdAt");

ALTER TABLE "OrderStatusChange" ADD CONSTRAINT "OrderStatusChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderStatusChange" ADD CONSTRAINT "OrderStatusChange_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Commandes déjà enregistrées : première ligne d'historique « commande reçue », à leur date de création
INSERT INTO "OrderStatusChange" ("id", "orderId", "fromStatus", "toStatus", "createdAt")
SELECT gen_random_uuid()::text, "id", NULL, 'PAIEMENT_A_VERIFIER', "createdAt" FROM "Order" WHERE "status" = 'PAIEMENT_A_VERIFIER';
