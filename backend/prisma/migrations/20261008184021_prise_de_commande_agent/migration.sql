-- Lot 2 de la feuille de route : prise de commande par l'agent (réglage, éteint par défaut).
-- Structure : table OrderSource, colonnes vides sur Order (provenance, agent qui a saisi), réglage
-- AppSettings.agentOrders (false). Les commandes existantes ne sont pas modifiées : sans provenance = « Site ».
-- Données (accord du client le 8 octobre 2026) : les 4 provenances de départ, créées seulement si elles
-- n'existent pas. Sans effet tant que le réglage est éteint.

-- CreateEnum
CREATE TYPE "OrderSourceKind" AS ENUM ('SITE', 'APPEL', 'WHATSAPP', 'AUTRE');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "agentOrders" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceName" TEXT;

-- CreateTable
CREATE TABLE "OrderSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "OrderSourceKind" NOT NULL,
    "phone" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderSource_name_key" ON "OrderSource"("name");

-- CreateIndex
CREATE INDEX "OrderSource_position_idx" ON "OrderSource"("position");

-- CreateIndex
CREATE INDEX "Order_customerPhone_createdAt_idx" ON "Order"("customerPhone", "createdAt");

-- CreateIndex
CREATE INDEX "Order_sourceId_idx" ON "Order"("sourceId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "OrderSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Provenances de départ (seulement si absentes)
INSERT INTO "OrderSource" ("id", "name", "kind", "phone", "position", "isActive", "updatedAt") VALUES
  ('provenance_site', 'Site', 'SITE', NULL, 0, true, CURRENT_TIMESTAMP),
  ('provenance_appel', 'Appel', 'APPEL', NULL, 1, true, CURRENT_TIMESTAMP),
  ('provenance_whatsapp_05234848', 'WhatsApp +226 05 23 48 48', 'WHATSAPP', '+22605234848', 2, true, CURRENT_TIMESTAMP),
  ('provenance_whatsapp_50627070', 'WhatsApp +226 50 62 70 70 (Telmob)', 'WHATSAPP', '+22650627070', 3, true, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
