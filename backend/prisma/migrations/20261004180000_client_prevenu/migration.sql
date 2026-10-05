-- Client prévenu à chaque étape : envoi du message confirmé par l'agent, ou client prévenu par appel
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderEventType" ADD VALUE 'MESSAGE_ENVOYE';
ALTER TYPE "OrderEventType" ADD VALUE 'CLIENT_APPELE';

