-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "reviewsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "reviewToken" TEXT;

-- CreateTable
CREATE TABLE "OrderReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "callCenterRating" INTEGER NOT NULL,
    "foodRating" INTEGER NOT NULL,
    "deliveryRating" INTEGER,
    "comment" TEXT,
    "lowRating" BOOLEAN NOT NULL,
    "calledBackAt" TIMESTAMP(3),
    "calledBackById" TEXT,
    "calledBackByName" TEXT,
    "calledBackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderReview_orderId_key" ON "OrderReview"("orderId");

-- CreateIndex
CREATE INDEX "OrderReview_createdAt_idx" ON "OrderReview"("createdAt");

-- CreateIndex
CREATE INDEX "OrderReview_lowRating_calledBackAt_idx" ON "OrderReview"("lowRating", "calledBackAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reviewToken_key" ON "Order"("reviewToken");

-- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_calledBackById_fkey" FOREIGN KEY ("calledBackById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Lot 7, règles vérifiées par la base elle-même (en plus du serveur) :
-- notes de 1 à 5 ; lowRating vrai si et seulement si une note est de 2 ou moins ; textes de longueur limitée.
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_ratings_check" CHECK (
  "callCenterRating" BETWEEN 1 AND 5
  AND "foodRating" BETWEEN 1 AND 5
  AND ("deliveryRating" IS NULL OR "deliveryRating" BETWEEN 1 AND 5)
);
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_lowRating_check" CHECK (
  "lowRating" = ("callCenterRating" <= 2 OR "foodRating" <= 2 OR COALESCE("deliveryRating", 5) <= 2)
);
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_text_check" CHECK (
  ("comment" IS NULL OR char_length("comment") <= 500)
  AND ("calledBackNote" IS NULL OR char_length("calledBackNote") <= 300)
);

-- Un avis ne se modifie pas (accord du client du 11 octobre 2026). Deux exceptions seulement :
--   (a) l'enregistrement du rappel du client : une seule fois (calledBackAt vide avant, rempli après), seulement
--       pour un mauvais avis, et seules les 4 colonnes calledBack… changent ;
--   (b) un compte de l'équipe supprimé : le lien calledBackById passe à vide (règle ON DELETE SET NULL),
--       toutes les autres colonnes restant identiques ; le nom copié calledBackByName reste.
-- Les notes, le commentaire et lowRating ne changent jamais. Les SUPPRESSIONS ne sont pas bloquées : une
-- commande supprimée emporte son avis (ON DELETE CASCADE), pour le nettoyage des commandes d'essai.
CREATE FUNCTION "order_review_no_update"() RETURNS trigger AS $$
BEGIN
  IF OLD."calledBackById" IS NOT NULL AND NEW."calledBackById" IS NULL
     AND (to_jsonb(NEW) - 'calledBackById') = (to_jsonb(OLD) - 'calledBackById') THEN
    RETURN NEW;
  END IF;
  IF OLD."lowRating" AND OLD."calledBackAt" IS NULL AND NEW."calledBackAt" IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['calledBackAt', 'calledBackById', 'calledBackByName', 'calledBackNote'])
       = (to_jsonb(OLD) - ARRAY['calledBackAt', 'calledBackById', 'calledBackByName', 'calledBackNote']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un avis de client ne peut pas être modifié.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderReview_no_update"
  BEFORE UPDATE ON "OrderReview"
  FOR EACH ROW EXECUTE FUNCTION "order_review_no_update"();
