-- CreateEnum
CREATE TYPE "Langue" AS ENUM ('FR', 'EN');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "englishSite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "language" "Langue";

