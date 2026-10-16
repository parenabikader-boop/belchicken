-- Mode « Livreurs indépendants » (interrupteur LIVREURS_INDEPENDANTS, fermé par défaut) : une seule valeur
-- ajoutée à la liste DeliveryOperator, pour le mode des nouvelles commandes, le mode noté sur une commande
-- et l'équipe d'un compte Livreur. Aucune donnée écrite, aucune colonne ajoutée.
-- À savoir : PostgreSQL ne permet pas de retirer une valeur d'une liste ; elle reste inutilisée tant que
-- l'interrupteur est fermé.

-- AlterEnum
ALTER TYPE "DeliveryOperator" ADD VALUE 'INDEPENDANT';
