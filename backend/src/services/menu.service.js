import { prisma } from '../lib/prisma.js';

// Menu public : catégories actives, sous-groupes, produits et variantes, dans l'ordre du menu.
// Les produits indisponibles sont renvoyés avec isAvailable=false pour être affichés grisés.
export async function getPublicMenu() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: {
      groups: { orderBy: { position: 'asc' }, select: { id: true, name: true, note: true } },
      products: {
        orderBy: { position: 'asc' },
        include: {
          variants: {
            orderBy: { position: 'asc' },
            select: { id: true, code: true, label: true, subLabel: true, price: true },
          },
        },
      },
    },
  });

  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    groups: c.groups,
    products: c.products.map((p) => ({
      id: p.id,
      slug: p.slug,
      number: p.number,
      name: p.name,
      description: p.description,
      composition: p.composition,
      imageUrl: p.imageUrl,
      isSpicy: p.isSpicy,
      serves: p.serves,
      choiceLabel: p.choiceLabel,
      choices: p.choices,
      isAvailable: p.isAvailable,
      groupId: p.groupId,
      variants: p.variants,
    })),
  }));
}
