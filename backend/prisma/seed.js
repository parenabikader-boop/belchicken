// Remplit une base VIDE avec le menu de menu-data.js (premier déploiement).
// Dès qu'un plat existe, il ne fait rien : le menu se gère alors depuis l'espace équipe,
// et un déploiement ne doit jamais écraser les prix, photos ou disponibilités modifiés par l'équipe.
import { PrismaClient } from '@prisma/client';
import { categories, products, homePhotos } from './menu-data.js';

const prisma = new PrismaClient();

async function fill(tx) {
  const categoryIds = {};
  const groupIds = {};

  for (const [cPos, c] of categories.entries()) {
    const category = await tx.category.create({
      data: {
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        script: c.script ?? null,
        heroImageUrl: c.heroImageUrl ?? null,
        isDrinks: c.isDrinks ?? false,
        position: cPos,
      },
    });
    categoryIds[c.slug] = category.id;

    for (const [gPos, g] of c.groups.entries()) {
      const group = await tx.menuGroup.create({
        data: { categoryId: category.id, name: g.name, note: g.note ?? null, position: gPos },
      });
      groupIds[`${c.slug}/${g.name}`] = group.id;
    }
  }

  for (const [pPos, p] of products.entries()) {
    const categoryId = categoryIds[p.category];
    const groupId = groupIds[`${p.category}/${p.group}`];
    if (!categoryId || !groupId) throw new Error(`Catégorie ou groupe inconnu pour ${p.slug}`);

    await tx.product.create({
      data: {
        slug: p.slug,
        number: p.number ?? null,
        name: p.name,
        description: p.description ?? null,
        composition: p.composition ?? [],
        imageUrl: p.imageUrl ?? null,
        isSpicy: p.isSpicy ?? false,
        serves: p.serves ?? null,
        choiceLabel: p.choiceLabel ?? null,
        choices: p.choices ?? [],
        position: pPos,
        categoryId,
        groupId,
        variants: {
          create: p.variants.map((v, vPos) => ({
            code: v.code, label: v.label, subLabel: v.subLabel ?? null, price: v.price, drinkCount: v.drinkCount ?? 0, position: vPos,
          })),
        },
      },
    });
  }

  for (const h of homePhotos) {
    await tx.homePhoto.upsert({ where: { slot: h.slot }, update: {}, create: h });
  }
}

async function main() {
  const existing = await prisma.product.count();
  if (existing > 0) {
    console.log(`Menu déjà en base (${existing} plats) : rien n'est modifié. Le menu se gère depuis l'espace équipe.`);
    return;
  }
  // Tout ou rien : si le chargement échoue en route, la base reste vide et le prochain déploiement recommence
  await prisma.$transaction(fill, { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 });
  console.log(`Base vide remplie : ${categories.length} catégories, ${products.length} plats, ${homePhotos.length} photos d'accueil.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
