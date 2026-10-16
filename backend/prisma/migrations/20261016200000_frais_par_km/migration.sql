-- Plan 3, frais de livraison par kilomètre (interrupteur FRAIS_PAR_KM, fermé par défaut).
-- Écrite sans base (prisma migrate diff). Déplacée dans prisma/migrations/ le 16 octobre 2026 avec l'accord écrit du
-- client, après sa sauvegarde Neon de production (« sauvegarde-prod-avant-lots-3-4 ») : appliquée par Render au déploiement.
-- Structure seulement, aucune donnée écrite :
--   - deux valeurs ajoutées à la liste DeliveryFeeSource (KM_ROUTE, KM_ESTIMATION), utilisées seulement quand
--     l'interrupteur est ouvert (PostgreSQL ne permet pas de retirer une valeur d'une liste ; inutilisées, elles ne gênent rien) ;
--   - table DeliveryKmGrid (grille par km du Patron), vide.
-- Aucune colonne ajoutée à une table existante : tant que l'interrupteur est fermé, le code tourne même sans cette migration.
-- Retour en arrière de la table sans perte : DROP TABLE "DeliveryKmGrid";

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryFeeSource" ADD VALUE 'KM_ROUTE';
ALTER TYPE "DeliveryFeeSource" ADD VALUE 'KM_ESTIMATION';

-- CreateTable
CREATE TABLE "DeliveryKmGrid" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseFee" INTEGER NOT NULL DEFAULT 0,
    "perKmFee" INTEGER NOT NULL DEFAULT 0,
    "roundTo" INTEGER NOT NULL DEFAULT 100,
    "minFee" INTEGER NOT NULL DEFAULT 0,
    "maxFee" INTEGER NOT NULL DEFAULT 50000,
    "maxKm" DOUBLE PRECISION,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryKmGrid_pkey" PRIMARY KEY ("id")
);

