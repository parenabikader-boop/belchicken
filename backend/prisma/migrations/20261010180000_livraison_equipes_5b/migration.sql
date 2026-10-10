-- Lot 5b : disponibilité des livreurs, livreurs du restaurant ou de notre équipe, rôle Responsable livraison,
-- caisse séparée selon le mode (structure seulement, aucune ligne écrite).
-- Les lignes existantes reçoivent les valeurs par défaut (PostgreSQL les ajoute sans réécrire les tables) :
-- tous les livreurs d'avant = équipe RESTAURANT et DISPONIBLE, toutes les remises d'espèces = caisse RESTAURANT,
-- réglage « Tournées et disponibilité (mode Restaurant) » éteint. Fonctionnement d'avant inchangé.
-- Journal de sécurité : COMPTE_LIVRAISON (comptes de notre équipe de livraison, accord du client du 10 octobre 2026).
-- CreateEnum
CREATE TYPE "CourierAvailability" AS ENUM ('DISPONIBLE', 'EN_PAUSE');

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'RESPONSABLE_LIVRAISON';

-- AlterEnum
ALTER TYPE "SecurityLogType" ADD VALUE 'COMPTE_LIVRAISON';

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "restaurantDispatch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CashRemittance" ADD COLUMN     "operator" "DeliveryOperator" NOT NULL DEFAULT 'RESTAURANT';

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "availability" "CourierAvailability" NOT NULL DEFAULT 'DISPONIBLE',
ADD COLUMN     "availabilityChangedAt" TIMESTAMP(3),
ADD COLUMN     "courierTeam" "DeliveryOperator" NOT NULL DEFAULT 'RESTAURANT';

-- CreateTable
CREATE TABLE "CourierAvailabilityChange" (
    "id" TEXT NOT NULL,
    "courierId" TEXT,
    "courierName" TEXT NOT NULL,
    "team" "DeliveryOperator" NOT NULL,
    "from" "CourierAvailability" NOT NULL,
    "to" "CourierAvailability" NOT NULL,
    "byName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierAvailabilityChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierAvailabilityChange_courierId_createdAt_idx" ON "CourierAvailabilityChange"("courierId", "createdAt");

-- CreateIndex
CREATE INDEX "CourierAvailabilityChange_createdAt_idx" ON "CourierAvailabilityChange"("createdAt");

-- CreateIndex
CREATE INDEX "CashRemittance_operator_createdAt_idx" ON "CashRemittance"("operator", "createdAt");

-- AddForeignKey
ALTER TABLE "CourierAvailabilityChange" ADD CONSTRAINT "CourierAvailabilityChange_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

