-- Espace livreur : rôle LIVREUR, livreur assigné, code de remise à 4 chiffres
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderEventType" ADD VALUE 'LIVREUR_ASSIGNE';
ALTER TYPE "OrderEventType" ADD VALUE 'CODE_INCORRECT';
ALTER TYPE "OrderEventType" ADD VALUE 'LIVRAISON_SANS_CODE';

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'LIVREUR';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierAssignedAt" TIMESTAMP(3),
ADD COLUMN     "courierId" TEXT,
ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "deliveryCode" TEXT,
ADD COLUMN     "deliveryCodeAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderEvent" ADD COLUMN     "courierName" TEXT;

-- CreateIndex
CREATE INDEX "Order_courierId_status_idx" ON "Order"("courierId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
