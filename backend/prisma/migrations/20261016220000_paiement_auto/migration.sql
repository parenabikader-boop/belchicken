-- Plan 2, paiement du repas validé automatiquement (interrupteur PAIEMENT_AUTO, fermé par défaut).
-- Écrite sans base (prisma migrate diff). Déplacée dans prisma/migrations/ le 16 octobre 2026 avec l'accord écrit du
-- client, après sa sauvegarde Neon de production (« sauvegarde-prod-avant-lots-3-4 ») : appliquée par Render au déploiement.
-- Structure seulement, aucune donnée écrite : une table AutoPayment (journal des paiements reçus), vide, reliée à
-- Order par sa propre colonne orderId. Aucune colonne ajoutée à une table existante : tant que l'interrupteur est
-- fermé, le code tourne même sans cette migration.
-- Retour en arrière sans perte : DROP TABLE "AutoPayment";

-- CreateTable
CREATE TABLE "AutoPayment" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "operator" "PaymentMethod",
    "amount" INTEGER,
    "payerPhone" TEXT,
    "externalId" TEXT,
    "sender" TEXT,
    "text" TEXT,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "orderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoPayment_dedupeKey_key" ON "AutoPayment"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "AutoPayment_orderId_key" ON "AutoPayment"("orderId");

-- CreateIndex
CREATE INDEX "AutoPayment_status_receivedAt_idx" ON "AutoPayment"("status", "receivedAt");

-- AddForeignKey
ALTER TABLE "AutoPayment" ADD CONSTRAINT "AutoPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

