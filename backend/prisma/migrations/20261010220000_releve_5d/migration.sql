-- Lot 5d : conditions du contrat de livraison (versions datées) et relevé par période
-- (structure seulement, aucune ligne écrite ni modifiée). Sans version, le relevé n'affiche aucun montant dû.
-- CreateEnum
CREATE TYPE "ContractKind" AS ENUM ('AUCUNE', 'PAR_LIVRAISON', 'FORFAIT_MENSUEL');

-- AlterEnum
ALTER TYPE "SecurityLogType" ADD VALUE 'CONTRAT';

-- CreateTable
CREATE TABLE "DeliveryContractTerms" (
    "id" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "kind" "ContractKind" NOT NULL,
    "perDeliveryPrice" INTEGER,
    "monthlyFee" INTEGER,
    "freeDeliveryPrice" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryContractTerms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryContractTerms_validFrom_key" ON "DeliveryContractTerms"("validFrom");

-- CreateIndex
CREATE INDEX "OrderStatusChange_toStatus_createdAt_idx" ON "OrderStatusChange"("toStatus", "createdAt");


-- Conditions du contrat (accord du client du 10 octobre 2026) : une version ne se modifie jamais, on en
-- ajoute une nouvelle. La base refuse toute MODIFICATION. Les SUPPRESSIONS ne sont pas bloquées par la base :
-- l'API ne supprime qu'une version pas encore commencée (date d'effet après aujourd'hui).
CREATE FUNCTION "contract_terms_no_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Une version des conditions du contrat ne peut pas être modifiée : ajoutez-en une nouvelle.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DeliveryContractTerms_no_update"
  BEFORE UPDATE ON "DeliveryContractTerms"
  FOR EACH ROW EXECUTE FUNCTION "contract_terms_no_update"();
