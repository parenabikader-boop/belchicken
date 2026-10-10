-- Lot 5a : livraison en deux modes, fondations (structure seulement, aucune donnée écrite).
-- Pas de ligne DeliveryCompany = mode Restaurant : fonctionnement d'avant le lot 5.
-- Les commandes existantes reçoivent la valeur par défaut RESTAURANT (PostgreSQL l'ajoute sans réécrire la table).
-- Journal de sécurité : MOT_DE_PASSE (changement du mot de passe du Prestataire dans l'application, accord
-- du 10 octobre 2026) et LIVRAISON (mode, société ou codes marchands changés).

-- CreateEnum
CREATE TYPE "DeliveryOperator" AS ENUM ('RESTAURANT', 'PRESTATAIRE');

-- AlterEnum
ALTER TYPE "SecurityLogType" ADD VALUE 'MOT_DE_PASSE';
ALTER TYPE "SecurityLogType" ADD VALUE 'LIVRAISON';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryOperator" "DeliveryOperator" NOT NULL DEFAULT 'RESTAURANT';

-- CreateTable
CREATE TABLE "DeliveryCompany" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" "DeliveryOperator" NOT NULL DEFAULT 'RESTAURANT',
    "companyName" TEXT,
    "merchantName" TEXT,
    "orangeCode" TEXT,
    "moovCode" TEXT,
    "telecelCode" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryCompany_pkey" PRIMARY KEY ("id")
);
