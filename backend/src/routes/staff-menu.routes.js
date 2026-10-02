import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { availabilitySchema, categorySchema, orderSchema, productSchema } from '../services/menu-edit.js';
import {
  createCategory, createProduct, deleteCategory, deleteProduct, getStaffMenu, reorderCategories, reorderProducts,
  restoreProduct, setAvailability, updateCategory, updateProduct,
} from '../services/staff-menu.service.js';

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
