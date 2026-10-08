-- À emporter : code de retrait à 4 chiffres, tapé au comptoir.
-- Le code réutilise les colonnes du code de remise (deliveryCode, deliveryCodeAttempts) : aucune colonne ajoutée.
-- Nouvel événement : remise au comptoir validée sans code, avec un motif.
ALTER TYPE "OrderEventType" ADD VALUE 'RETRAIT_SANS_CODE';
