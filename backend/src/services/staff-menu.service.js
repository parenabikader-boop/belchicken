// Menu de l'espace équipe : lecture, disponibilité (Patron et Opérateur),
// création, modification, suppression et ordre des plats et catégories (Patron).
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { planVariants, sameItems, slugify, uniqueSlug } from './menu-edit.js';
import { deletePhoto, uploadPhoto } from './photo.service.js';

const variantSelect = { id: true, code: true, label: true, subLabel: true, price: true, drinkCount: true, position: true };

const toStaffProduct = (p) => ({
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
  archivedAt: p.archivedAt,
  categoryId: p.categoryId,
  groupId: p.groupId,
  variants: p.variants,
});

// Tout le menu, catégories masquées comprises. Les plats retirés du menu sont à part.
export async function getStaffMenu() {
  const [categories, archived] = await Promise.all([
    prisma.category.findMany({
      orderBy: { position: 'asc' },
      include: {
        groups: { orderBy: { position: 'asc' }, select: { id: true, name: true, note: true } },
        products: {
          where: { archivedAt: null },
          orderBy: { position: 'asc' },
          include: { variants: { orderBy: { position: 'asc' }, select: variantSelect } },
        },
      },
    }),
    prisma.product.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: 'desc' },
      include: { variants: { orderBy: { position: 'asc' }, select: variantSelect } },
    }),
  ]);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      script: c.script,
      heroImageUrl: c.heroImageUrl,
      isActive: c.isActive,
      isDrinks: c.isDrinks, // catégorie « Boissons » : ses plats se choisissent dans les formules
      groups: c.groups,
      products: c.products.map(toStaffProduct),
    })),
    archived: archived.map(toStaffProduct),
  };
}

async function findProduct(id, { includeArchived = false } = {}) {
  const product = await prisma.product.findUnique({ where: { id: String(id) }, include: { variants: { select: variantSelect } } });
  if (!product || (product.archivedAt && !includeArchived)) throw new AppError(404, 'Plat introuvable.', 'PLAT_INTROUVABLE');
  return product;
}

async function findCategory(id) {
  const category = await prisma.category.findUnique({ where: { id: String(id) }, include: { groups: true } });
  if (!category) throw new AppError(404, 'Catégorie introuvable.', 'CATEGORIE_INTROUVABLE');
  return category;
}

async function readProduct(id) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: { variants: { orderBy: { position: 'asc' }, select: variantSelect } },
  });
  return toStaffProduct(p);
}

// La section choisie doit appartenir à la catégorie choisie
async function checkPlacement({ categoryId, groupId }) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { groups: { select: { id: true } } } });
  if (!category) throw new AppError(400, 'Catégorie introuvable.', 'CATEGORIE_INTROUVABLE');
  if (groupId && !category.groups.some((g) => g.id === groupId)) {
    throw new AppError(400, "Cette section n'appartient pas à la catégorie choisie.", 'SECTION_INVALIDE');
  }
}

// Nom de section déjà pris dans la catégorie (contrainte unique en base)
const isUniqueError = (e) => e?.code === 'P2002';

// ─── Disponibilité : Patron et Opérateur ───

export async function setAvailability(id, isAvailable) {
  await findProduct(id);
  await prisma.product.update({ where: { id: String(id) }, data: { isAvailable } });
  return readProduct(String(id));
}

// ─── Plats : Patron ───

const productData = (input) => ({
  number: input.number,
  name: input.name,
  description: input.description,
  composition: input.composition,
  isSpicy: input.isSpicy,
  serves: input.serves,
  choiceLabel: input.choiceLabel,
  choices: input.choices,
  categoryId: input.categoryId,
  groupId: input.groupId,
});

export async function createProduct(input) {
  await checkPlacement(input);
  if (input.variants.some((v) => v.id)) throw new AppError(400, 'Formule inconnue.', 'FORMULE_INCONNUE');
  const taken = await prisma.product.findMany({ select: { slug: true } });
  const last = await prisma.product.aggregate({ where: { categoryId: input.categoryId }, _max: { position: true } });
  const { create } = planVariants([], input.variants);
  const product = await prisma.product.create({
    data: {
      ...productData(input),
      slug: uniqueSlug(slugify(input.name), taken.map((t) => t.slug)),
      position: (last._max.position ?? -1) + 1,
      variants: { create },
    },
  });
  return readProduct(product.id);
}

export async function updateProduct(id, input) {
  const product = await findProduct(id);
  await checkPlacement(input);
  let plan;
  try {
    plan = planVariants(product.variants, input.variants);
  } catch {
    throw new AppError(400, 'Une formule a été modifiée entre-temps. Rechargez la page.', 'FORMULE_INCONNUE');
  }
  const data = productData(input);
  // Changement de catégorie : le plat passe à la fin de sa nouvelle catégorie
  if (input.categoryId !== product.categoryId) {
    const last = await prisma.product.aggregate({ where: { categoryId: input.categoryId }, _max: { position: true } });
    data.position = (last._max.position ?? -1) + 1;
  }
  // Les commandes passées gardent leur copie du nom et du prix (OrderItem) : rien ne change pour elles
  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data }),
    prisma.productVariant.deleteMany({ where: { id: { in: plan.remove } } }),
    ...plan.update.map(({ id: variantId, ...v }) => prisma.productVariant.update({ where: { id: variantId }, data: v })),
    ...plan.create.map((v) => prisma.productVariant.create({ data: { ...v, productId: product.id } })),
  ]);
  return readProduct(product.id);
}

// Jamais commandé : supprimé pour de bon. Déjà commandé : retiré du menu (archivé),
// pour garder le lien avec les commandes passées et les statistiques.
export async function deleteProduct(id) {
  const product = await findProduct(id);
  const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
  if (ordered === 0) {
    await prisma.product.delete({ where: { id: product.id } });
    await deletePhoto(product.imagePublicId);
    return { result: 'SUPPRIME' };
  }
  await prisma.product.update({ where: { id: product.id }, data: { archivedAt: new Date() } });
  return { result: 'ARCHIVE', ordered };
}

// Remet au menu un plat retiré : à la fin de sa catégorie, indisponible le temps de vérifier sa fiche
export async function restoreProduct(id) {
  const product = await findProduct(id, { includeArchived: true });
  if (!product.archivedAt) return readProduct(product.id);
  const last = await prisma.product.aggregate({ where: { categoryId: product.categoryId, archivedAt: null }, _max: { position: true } });
  await prisma.product.update({
    where: { id: product.id },
    data: { archivedAt: null, isAvailable: false, position: (last._max.position ?? -1) + 1 },
  });
  return readProduct(product.id);
}

export async function reorderProducts(categoryId, ids) {
  const current = await prisma.product.findMany({ where: { categoryId: String(categoryId), archivedAt: null }, select: { id: true } });
  if (!sameItems(current.map((p) => p.id), ids)) {
    throw new AppError(409, 'Le menu a changé entre-temps. Rechargez la page.', 'ORDRE_PERIME');
  }
  await prisma.$transaction(ids.map((id, position) => prisma.product.update({ where: { id }, data: { position } })));
}

// ─── Catégories : Patron ───

export async function createCategory(input) {
  const taken = await prisma.category.findMany({ select: { slug: true } });
  const last = await prisma.category.aggregate({ _max: { position: true } });
  const category = await prisma.category.create({
    data: {
      slug: uniqueSlug(slugify(input.name), taken.map((t) => t.slug)),
      name: input.name,
      script: input.script,
      description: input.description,
      isActive: input.isActive,
      position: (last._max.position ?? -1) + 1,
      groups: { create: input.groups.map((g, position) => ({ name: g.name, note: g.note, position })) },
    },
  });
  return category.id;
}

// Sections : celles qui manquent sont supprimées (leurs plats passent dans « Autres »)
export async function updateCategory(id, input) {
  const category = await findCategory(id);
  const known = new Set(category.groups.map((g) => g.id));
  if (input.groups.some((g) => g.id && !known.has(g.id))) {
    throw new AppError(400, 'Une section a été modifiée entre-temps. Rechargez la page.', 'SECTION_INCONNUE');
  }
  const keep = new Set(input.groups.filter((g) => g.id).map((g) => g.id));
  const removed = category.groups.filter((g) => !keep.has(g.id)).map((g) => g.id);
  try {
    await prisma.$transaction([
      prisma.category.update({
        where: { id: category.id },
        data: { name: input.name, script: input.script, description: input.description, isActive: input.isActive },
      }),
      prisma.menuGroup.deleteMany({ where: { id: { in: removed } } }),
      // Noms provisoires d'abord : permet d'échanger deux noms de section sans heurter la contrainte unique
      ...input.groups.filter((g) => g.id).map((g) => prisma.menuGroup.update({ where: { id: g.id }, data: { name: `~${g.id}` } })),
      ...input.groups.map((g, position) =>
        g.id
          ? prisma.menuGroup.update({ where: { id: g.id }, data: { name: g.name, note: g.note, position } })
          : prisma.menuGroup.create({ data: { categoryId: category.id, name: g.name, note: g.note, position } }),
      ),
    ]);
  } catch (e) {
    if (isUniqueError(e)) throw new AppError(409, 'Deux sections portent le même nom.', 'SECTION_EN_DOUBLE');
    throw e;
  }
  return category.id;
}

// Seulement une catégorie vide : sinon, la masquer (isActive)
export async function deleteCategory(id) {
  const category = await findCategory(id);
  const [active, archived] = await Promise.all([
    prisma.product.count({ where: { categoryId: category.id, archivedAt: null } }),
    prisma.product.count({ where: { categoryId: category.id, archivedAt: { not: null } } }),
  ]);
  if (active > 0) {
    throw new AppError(409, `Cette catégorie contient encore ${active} plat${active > 1 ? 's' : ''}. Déplacez-les ou supprimez-les d'abord, ou masquez la catégorie.`, 'CATEGORIE_NON_VIDE');
  }
  if (archived > 0) {
    throw new AppError(409, 'Cette catégorie garde des plats déjà commandés (retirés du menu). Masquez-la plutôt.', 'CATEGORIE_NON_VIDE');
  }
  await prisma.category.delete({ where: { id: category.id } });
  await deletePhoto(category.heroImagePublicId);
}

export async function reorderCategories(ids) {
  const current = await prisma.category.findMany({ select: { id: true } });
  if (!sameItems(current.map((c) => c.id), ids)) {
    throw new AppError(409, 'Le menu a changé entre-temps. Rechargez la page.', 'ORDRE_PERIME');
  }
  await prisma.$transaction(ids.map((id, position) => prisma.category.update({ where: { id }, data: { position } })));
}

// ─── Photos : Patron ───
// La nouvelle photo est enregistrée avant de supprimer l'ancienne : en cas d'échec, rien n'est perdu.

export async function setProductPhoto(id, buffer) {
  const product = await findProduct(id);
  const photo = await uploadPhoto(buffer, 'plats');
  try {
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl: photo.url, imagePublicId: photo.publicId } });
  } catch (e) {
    await deletePhoto(photo.publicId);
    throw e;
  }
  await deletePhoto(product.imagePublicId);
  return readProduct(product.id);
}

export async function removeProductPhoto(id) {
  const product = await findProduct(id);
  await prisma.product.update({ where: { id: product.id }, data: { imageUrl: null, imagePublicId: null } });
  await deletePhoto(product.imagePublicId);
  return readProduct(product.id);
}

const toPhoto = (c) => ({ id: c.id, heroImageUrl: c.heroImageUrl });

export async function setCategoryPhoto(id, buffer) {
  const category = await findCategory(id);
  const photo = await uploadPhoto(buffer, 'categories');
  let updated;
  try {
    updated = await prisma.category.update({ where: { id: category.id }, data: { heroImageUrl: photo.url, heroImagePublicId: photo.publicId } });
  } catch (e) {
    await deletePhoto(photo.publicId);
    throw e;
  }
  await deletePhoto(category.heroImagePublicId);
  return toPhoto(updated);
}

export async function removeCategoryPhoto(id) {
  const category = await findCategory(id);
  const updated = await prisma.category.update({ where: { id: category.id }, data: { heroImageUrl: null, heroImagePublicId: null } });
  await deletePhoto(category.heroImagePublicId);
  return toPhoto(updated);
}
