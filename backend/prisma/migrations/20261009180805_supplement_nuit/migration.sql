-- Lot 3 : supplément de nuit dans la grille des frais (structure seulement, aucune donnée écrite).
-- Réglage éteint et 0 F partout par défaut : fonctionnement d'avant.

-- AlterTable
ALTER TABLE "DeliveryDistanceBand" ADD COLUMN     "nightFee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DeliverySettings" ADD COLUMN     "nightEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nightEndMin" INTEGER NOT NULL DEFAULT 360,
ADD COLUMN     "nightStartMin" INTEGER NOT NULL DEFAULT 1320;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "nightFee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryNightFee" INTEGER;
