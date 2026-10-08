-- Lot 1 de la feuille de route : parcours court (réglage, éteint par défaut) et commande qui l'a suivi.
-- Structure seulement : AUCUNE donnée écrite (pas de ligne AppSettings = parcours court éteint).
-- Les commandes existantes gardent shortFlow = false : leur parcours ne change pas.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shortFlow" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shortFlow" BOOLEAN NOT NULL DEFAULT false,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
