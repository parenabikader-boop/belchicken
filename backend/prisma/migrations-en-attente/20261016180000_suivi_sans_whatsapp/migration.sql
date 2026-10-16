-- Plan 4, suivi du client sans messages payants (interrupteur SUIVI_SANS_WHATSAPP, fermé par défaut).
-- Écrite sans base (prisma migrate diff), NON APPLIQUÉE. Rangée dans prisma/migrations-en-attente/ : à déplacer dans
-- prisma/migrations/ seulement avec l'accord écrit du client, après une sauvegarde Neon.
-- Structure seulement, aucune donnée écrite :
--   - Order.trackingKey : clé secrète du lien de suivi (vide pour toutes les commandes existantes) ;
--   - table CustomerPushSubscription : alertes sur le téléphone du client, par commande (vide).
-- Retour en arrière possible sans perte (rien d'autre n'utilise ces deux éléments) :
--   DROP TABLE "CustomerPushSubscription"; DROP INDEX "Order_trackingKey_key"; ALTER TABLE "Order" DROP COLUMN "trackingKey";


-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "trackingKey" TEXT;

-- CreateTable
CREATE TABLE "CustomerPushSubscription" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPushSubscription_orderId_endpoint_key" ON "CustomerPushSubscription"("orderId", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingKey_key" ON "Order"("trackingKey");

-- AddForeignKey
ALTER TABLE "CustomerPushSubscription" ADD CONSTRAINT "CustomerPushSubscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
