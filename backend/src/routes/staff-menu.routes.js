import express, { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { availabilitySchema, categorySchema, orderSchema, productSchema } from '../services/menu-edit.js';
import {
  createCategory, createProduct, deleteCategory, deleteProduct, getStaffMenu, reorderCategories, reorderProducts,
  removeCategoryPhoto, removeProductPhoto, restoreProduct, setAvailability, setCategoryPhoto, setProductPhoto,
  updateCategory, updateProduct,
} from '../services/staff-menu.service.js';
import { MAX_PHOTO_BYTES } from '../services/photo.service.js';

// Menu de l'espace équipe. Patron et Opérateur : voir le menu et changer la disponibilité d'un plat.
// Tout le reste (prix, création, modification, suppression, ordre) : Patron seulement.
export const staffMenuRouter = Router();

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const both = requireStaff('PATRON', 'OPERATEUR');
const patron = requireStaff('PATRON');

staffMenuRouter.get('/', both, handle(async (req, res) => {
  res.json(await getStaffMenu());
}));

staffMenuRouter.patch('/products/:id/availability', both, handle(async (req, res) => {
  const { isAvailable } = availabilitySchema.parse(req.body);
  res.json({ product: await setAvailability(req.params.id, isAvailable) });
}));

// ─── Patron seulement ───

staffMenuRouter.post('/products', patron, handle(async (req, res) => {
  res.status(201).json({ product: await createProduct(productSchema.parse(req.body)) });
}));

staffMenuRouter.put('/products/:id', patron, handle(async (req, res) => {
  res.json({ product: await updateProduct(req.params.id, productSchema.parse(req.body)) });
}));

staffMenuRouter.delete('/products/:id', patron, handle(async (req, res) => {
  res.json(await deleteProduct(req.params.id));
}));

staffMenuRouter.post('/products/:id/restore', patron, handle(async (req, res) => {
  res.json({ product: await restoreProduct(req.params.id) });
}));

staffMenuRouter.post('/categories', patron, handle(async (req, res) => {
  const id = await createCategory(categorySchema.parse(req.body));
  res.status(201).json({ id });
}));

staffMenuRouter.put('/categories/order', patron, handle(async (req, res) => {
  await reorderCategories(orderSchema.parse(req.body).ids);
  res.json({ ok: true });
}));

staffMenuRouter.put('/categories/:id', patron, handle(async (req, res) => {
  res.json({ id: await updateCategory(req.params.id, categorySchema.parse(req.body)) });
}));

staffMenuRouter.delete('/categories/:id', patron, handle(async (req, res) => {
  await deleteCategory(req.params.id);
  res.json({ ok: true });
}));

staffMenuRouter.put('/categories/:id/products/order', patron, handle(async (req, res) => {
  await reorderProducts(req.params.id, orderSchema.parse(req.body).ids);
  res.json({ ok: true });
}));

// Photos : le fichier est envoyé tel quel dans le corps de la requête (Content-Type image/...),
// sans formulaire multipart. Le format réel est vérifié par photo.service.js.
const readPhoto = (req, res, next) =>
  express.raw({ type: () => true, limit: MAX_PHOTO_BYTES })(req, res, (err) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PHOTO_TROP_LOURDE', message: `Photo trop lourde. Maximum ${MAX_PHOTO_BYTES / 1024 / 1024} Mo.` } });
    }
    next(err);
  });
const photoBody = (req) => (Buffer.isBuffer(req.body) ? req.body : null);

staffMenuRouter.put('/products/:id/photo', patron, readPhoto, handle(async (req, res) => {
  res.json({ product: await setProductPhoto(req.params.id, photoBody(req)) });
}));

staffMenuRouter.delete('/products/:id/photo', patron, handle(async (req, res) => {
  res.json({ product: await removeProductPhoto(req.params.id) });
}));

staffMenuRouter.put('/categories/:id/photo', patron, readPhoto, handle(async (req, res) => {
  res.json({ category: await setCategoryPhoto(req.params.id, photoBody(req)) });
}));

staffMenuRouter.delete('/categories/:id/photo', patron, handle(async (req, res) => {
  res.json({ category: await removeCategoryPhoto(req.params.id) });
}));
