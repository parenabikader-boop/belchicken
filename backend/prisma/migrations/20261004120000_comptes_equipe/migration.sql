-- Page Équipe : mot de passe provisoire à changer à la première connexion
-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
