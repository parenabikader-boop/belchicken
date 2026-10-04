-- Frais de livraison (saisis et reçus par l'équipe) et historique des frais et messages WhatsApp au client
-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('FRAIS_SAISIS', 'FRAIS_RECUS', 'FRAIS_NON_RECUS', 'MESSAGE_PREPARE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryFee" INTEGER,
ADD COLUMN     "deliveryFeeReceivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "amount" INTEGER,
    "messageKey" TEXT,
    "staffUserId" TEXT,
    "staffName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

