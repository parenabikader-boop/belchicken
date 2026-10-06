-- Frais de livraison payés au livreur à la réception (espèces ou mobile money au numéro marchand).
-- Aucune donnée supprimée : deliveryFeeReceivedAt est RENOMMÉ en deliveryFeeVerifiedAt.

-- CreateEnum
CREATE TYPE "FeePaymentMethod" AS ENUM ('ESPECES', 'MOBILE_MONEY');

-- AlterEnum (IF NOT EXISTS : la migration peut être rejouée sans erreur)
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'FRAIS_VERIFIES';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'FRAIS_NON_VERIFIES';

-- AlterTable : renommage, puis nouvelles colonnes
ALTER TABLE "Order" RENAME COLUMN "deliveryFeeReceivedAt" TO "deliveryFeeVerifiedAt";
ALTER TABLE "Order" ADD COLUMN "cashRemittanceId" TEXT,
ADD COLUMN "deliveryFeeMethod" "FeePaymentMethod";

-- Anciennes commandes : frais déjà reçus avant le départ du livreur, par mobile money au numéro marchand
UPDATE "Order" SET "deliveryFeeMethod" = 'MOBILE_MONEY' WHERE "deliveryFeeVerifiedAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "CashRemittance" (
    "id" TEXT NOT NULL,
    "courierId" TEXT,
    "courierName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "receivedById" TEXT,
    "receivedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRemittance_courierId_createdAt_idx" ON "CashRemittance"("courierId", "createdAt");

-- CreateIndex
CREATE INDEX "CashRemittance_createdAt_idx" ON "CashRemittance"("createdAt");

-- CreateIndex
CREATE INDEX "Order_cashRemittanceId_idx" ON "Order"("cashRemittanceId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashRemittanceId_fkey" FOREIGN KEY ("cashRemittanceId") REFERENCES "CashRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRemittance" ADD CONSTRAINT "CashRemittance_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRemittance" ADD CONSTRAINT "CashRemittance_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
