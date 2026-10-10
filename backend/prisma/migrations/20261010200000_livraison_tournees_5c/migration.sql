-- Lot 5c : « Prête pour livraison » (mode Prestataire), « Commande récupérée », tournées, preuves horaires
-- (structure seulement, aucune ligne écrite ni modifiée). Les commandes existantes gardent leur statut ;
-- deliveryRunId est vide pour toutes.
-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PRETE_LIVRAISON';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderEventType" ADD VALUE 'RECUPEREE_SANS_LIVREUR';
ALTER TYPE "OrderEventType" ADD VALUE 'LIVREUR_RETIRE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryRunId" TEXT;

-- CreateTable
CREATE TABLE "DeliveryRun" (
    "id" TEXT NOT NULL,
    "operator" "DeliveryOperator" NOT NULL,
    "courierId" TEXT,
    "courierName" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryRun_courierId_createdAt_idx" ON "DeliveryRun"("courierId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryRun_createdAt_idx" ON "DeliveryRun"("createdAt");

-- CreateIndex
CREATE INDEX "Order_deliveryRunId_idx" ON "Order"("deliveryRunId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preuves (accord du client du 10 octobre 2026) : la base refuse toute MODIFICATION des lignes d'historique
-- des commandes (étapes et événements). Seule exception : un compte de l'équipe supprimé, le lien
-- "staffUserId" passe à vide (règle ON DELETE SET NULL), toutes les autres colonnes restant identiques ;
-- le nom copié "staffName" reste. Les SUPPRESSIONS ne sont pas bloquées : une commande supprimée emporte
-- son historique (ON DELETE CASCADE), pour le nettoyage des commandes d'essai avant la livraison.
CREATE FUNCTION "order_history_no_update"() RETURNS trigger AS $$
BEGIN
  IF OLD."staffUserId" IS NOT NULL AND NEW."staffUserId" IS NULL
     AND (to_jsonb(NEW) - 'staffUserId') = (to_jsonb(OLD) - 'staffUserId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'L''historique d''une commande est une preuve : il ne peut pas être modifié.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderStatusChange_no_update"
  BEFORE UPDATE ON "OrderStatusChange"
  FOR EACH ROW EXECUTE FUNCTION "order_history_no_update"();

CREATE TRIGGER "OrderEvent_no_update"
  BEFORE UPDATE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION "order_history_no_update"();
