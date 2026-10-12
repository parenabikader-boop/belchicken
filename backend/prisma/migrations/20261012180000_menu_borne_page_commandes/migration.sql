-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "kioskMenu" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newOrdersPage" BOOLEAN NOT NULL DEFAULT false;
