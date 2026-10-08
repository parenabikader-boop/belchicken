-- Grille des frais de livraison gérée par le Patron : quartiers, tranches de distance, option « Autre quartier ».
-- Frais figés dans la commande (montant, quartier, distance, origine) ; correction des frais avec un motif.
-- Structure seulement : AUCUNE donnée écrite. En production, la grille reste vide et le site garde
-- le fonctionnement d'avant (frais saisis par l'équipe) tant que le Patron ne l'a pas remplie.

-- CreateEnum
CREATE TYPE "DeliveryFeeSource" AS ENUM ('QUARTIER', 'DISTANCE', 'A_CONFIRMER', 'AGENT');

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'FRAIS_CORRIGES';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryDistanceM" INTEGER,
ADD COLUMN     "deliveryFeeSource" "DeliveryFeeSource",
ADD COLUMN     "deliveryZoneId" TEXT,
ADD COLUMN     "deliveryZoneName" TEXT;

-- AlterTable
ALTER TABLE "OrderEvent" ADD COLUMN     "previousAmount" INTEGER,
ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryDistanceBand" (
    "id" TEXT NOT NULL,
    "upToMeters" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryDistanceBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "allowOtherZone" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_name_key" ON "DeliveryZone"("name");

-- CreateIndex
CREATE INDEX "DeliveryZone_position_idx" ON "DeliveryZone"("position");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryDistanceBand_upToMeters_key" ON "DeliveryDistanceBand"("upToMeters");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
