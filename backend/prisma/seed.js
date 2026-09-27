// Charge le menu Belchicken en base. Idempotent : peut être relancé à chaque mise à jour du menu.
// N'écrase pas la disponibilité (isAvailable), gérée plus tard par l'équipe.
import { PrismaClient } from '@prisma/client';
import { categories, products } from './menu-data.js';

const prisma = new PrismaClient();

async function main() {
  const categoryIds = {};
  const groupIds = {};

  for (const [cPos, c] of categories.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, position: cPos },
      create: { slug: c.slug, name: c.name, description: c.description, position: cPos },
    });
    categoryIds[c.slug] = category.id;

    for (const [gPos, g] of c.groups.entries()) {
      const group = await prisma.menuGroup.upsert({
        where: { categoryId_name: { categoryId: category.id, name: g.name } },
        update: { note: g.note ?? null, position: gPos },
        create: { categoryId: category.id, name: g.name, note: g.note ?? null, position: gPos },
      });
      groupIds[`${c.slug}/${g.name}`] = group.id;
    }
  }

  for (const [pPos, p] of products.entries()) {
    const categoryId = categoryIds[p.category];
    const groupId = groupIds[`${p.category}/${p.group}`];
    if (!categoryId || !groupId) throw new Error(`Catégorie ou groupe inconnu pour ${p.slug}`);

    const data = {
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
    };
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });

    for (const [vPos, v] of p.variants.entries()) {
      await prisma.productVariant.upsert({
        where: { productId_code: { productId: product.id, code: v.code } },
        update: { label: v.label, subLabel: v.subLabel ?? null, price: v.price, position: vPos },
        create: { productId: product.id, code: v.code, label: v.label, subLabel: v.subLabel ?? null, price: v.price, position: vPos },
      });
    }
    // Supprime les variantes retirées du menu
    await prisma.productVariant.deleteMany({
      where: { productId: product.id, code: { notIn: p.variants.map((v) => v.code) } },
    });
  }

  console.log(`Menu chargé : ${categories.length} catégories, ${products.length} produits.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
