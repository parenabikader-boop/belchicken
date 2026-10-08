-- Boissons : catégorie « Boissons » (choix dans les formules et vente seule), nombre de boissons par formule,
-- boissons choisies par ligne de commande.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isDrinks" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "drinkCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderItemDrink" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItemDrink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItemDrink_orderItemId_idx" ON "OrderItemDrink"("orderItemId");

-- AddForeignKey
ALTER TABLE "OrderItemDrink" ADD CONSTRAINT "OrderItemDrink_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemDrink" ADD CONSTRAINT "OrderItemDrink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Données (base en ligne) ───
-- Le seed ne touche jamais une base remplie : la catégorie, les 7 boissons et le nombre de boissons
-- des formules sont donc posés ici. Ensuite tout se gère depuis l'espace équipe (Patron).

-- 1. Catégorie « Boissons » et ses 7 boissons, seulement si elle n'existe pas encore
INSERT INTO "Category" ("id", "slug", "name", "description", "script", "position", "isActive", "isDrinks", "updatedAt")
SELECT gen_random_uuid()::text, 'boissons', 'Boissons', 'Fraîches, à ajouter à votre commande ou à choisir dans votre menu.', 'Bien frais',
       COALESCE((SELECT MAX("position") + 1 FROM "Category"), 0), true, true, now()
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "slug" = 'boissons');

UPDATE "Category" SET "isDrinks" = true WHERE "slug" = 'boissons';

INSERT INTO "MenuGroup" ("id", "categoryId", "name", "position")
SELECT gen_random_uuid()::text, c."id", 'Boissons', 0 FROM "Category" c
WHERE c."slug" = 'boissons' AND NOT EXISTS (SELECT 1 FROM "MenuGroup" g WHERE g."categoryId" = c."id");

WITH drinks("slug", "name", "price", "position") AS (VALUES
  ('schweppes', 'Schweppes', 1000, 0),
  ('coca-cola', 'Coca-Cola', 1000, 1),
  ('fanta', 'Fanta', 1000, 2),
  ('sprite', 'Sprite', 1000, 3),
  ('malta-tonic', 'Malta Tonic', 1250, 4),
  ('cocktail-de-fruits-b-b', 'Cocktail de fruits B&B', 1500, 5),
  ('babali', 'Babali (eau)', 500, 6)
), cat AS (
  SELECT c."id" AS "categoryId", (SELECT g."id" FROM "MenuGroup" g WHERE g."categoryId" = c."id" ORDER BY g."position" LIMIT 1) AS "groupId"
  FROM "Category" c WHERE c."slug" = 'boissons'
), inserted AS (
  INSERT INTO "Product" ("id", "slug", "name", "composition", "choices", "position", "categoryId", "groupId", "updatedAt")
  SELECT gen_random_uuid()::text, d."slug", d."name", '{}', '{}', d."position", cat."categoryId", cat."groupId", now()
  FROM drinks d CROSS JOIN cat
  WHERE NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."slug" = d."slug")
  RETURNING "id", "slug"
)
INSERT INTO "ProductVariant" ("id", "productId", "code", "label", "price", "position")
SELECT gen_random_uuid()::text, i."id", 'standard', 'Standard', d."price", 0
FROM inserted i JOIN drinks d ON d."slug" = i."slug";

-- 2. Nombre de boissons incluses dans chaque formule
-- Formules « Menu » (burgers, wraps, salades) : 1 boisson
UPDATE "ProductVariant" SET "drinkCount" = 1 WHERE "code" = 'menu';

-- Plats vendus en une seule formule, boisson comprise
UPDATE "ProductVariant" v SET "drinkCount" = 1 FROM "Product" p
WHERE v."productId" = p."id" AND p."slug" IN (
  'wings-4', 'wings-8', 'wings-12', 'tenders-4', 'tenders-8', 'tenders-12',
  'fuego-wings-4', 'fuego-wings-8', 'fuego-wings-12', 'special-belchicken',
  'chefs-combo', 'boneless-combo', 'chefs-choice',
  'belgrill-rice-box', 'belicious-rice-box', 'belkids-box'
);
UPDATE "ProductVariant" v SET "drinkCount" = 2 FROM "Product" p WHERE v."productId" = p."id" AND p."slug" = 'friends-bucket';
UPDATE "ProductVariant" v SET "drinkCount" = 4 FROM "Product" p WHERE v."productId" = p."id" AND p."slug" = 'family-bucket';
