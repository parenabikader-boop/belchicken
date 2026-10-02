-- Gestion du menu et des photos depuis l'espace équipe.
-- Ajouts seulement : aucune colonne supprimée, aucune donnée perdue.

-- Catégories : petit titre et photo vedette du bandeau (jusqu'ici en dur dans frontend/src/utils/visuals.js)
ALTER TABLE "Category" ADD COLUMN "script" TEXT,
ADD COLUMN "heroImageUrl" TEXT,
ADD COLUMN "heroImagePublicId" TEXT;

-- Plats : identifiant Cloudinary de la photo, et date de retrait du menu (plat déjà commandé)
ALTER TABLE "Product" ADD COLUMN "imagePublicId" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Les 3 photos de l'accueil
CREATE TABLE "HomePhoto" (
    "slot" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "alt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomePhoto_pkey" PRIMARY KEY ("slot")
);

-- Reprise des valeurs actuelles, pour que le site reste identique après la migration
UPDATE "Category" AS c SET "script" = v.script, "heroImageUrl" = v.photo
FROM (VALUES
  ('burgers', 'Originals & XL', '/menu/finest.jpg'),
  ('poulet', 'Chicken Deals', '/menu/wings12.jpg'),
  ('combos', 'Le choix du chef', '/menu/chefs.jpg'),
  ('buckets', 'À partager', '/menu/family.jpg'),
  ('wraps', 'Wraps', '/menu/wrap_fuego.jpg'),
  ('rice-box', 'Rice Box', '/menu/rice_belgrill.jpg'),
  ('salades', '100 % Fresh', '/menu/salad_chicken.jpg'),
  ('bel-kids', 'Pour les petits', '/menu/kids.jpg'),
  ('extras', 'Pour compléter', '/menu/beignets.jpg')
) AS v(slug, script, photo)
WHERE c."slug" = v.slug;

-- Seulement si le menu est déjà en base (sinon le seed s'en charge)
INSERT INTO "HomePhoto" ("slot", "imageUrl", "alt", "updatedAt")
SELECT v.slot, v.url, v.alt, CURRENT_TIMESTAMP
FROM (VALUES
  (1, '/accueil/burger.webp', 'Burger Belchicken'),
  (2, '/accueil/wings.webp', 'Ailes de poulet Belchicken'),
  (3, '/accueil/bucket.webp', 'Bucket de poulet Belchicken')
) AS v(slot, url, alt)
WHERE EXISTS (SELECT 1 FROM "Product");
