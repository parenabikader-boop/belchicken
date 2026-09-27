import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createOrderSchema } from '../validators/order.schema.js';
import { createOrder, getOrderSummary, toPublicOrder } from '../services/order.service.js';

export const orderRouter = Router();

// Limite les envois abusifs : 8 commandes / 10 min par adresse IP
const createLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TROP_DE_COMMANDES', message: 'Trop de commandes envoyées. Réessayez dans quelques minutes.' } },
});

orderRouter.post('/', createLimiter, async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const order = await createOrder(input);
    res.status(201).json({ order: toPublicOrder(order) });
  } catch (e) {
    next(e);
  }
});

orderRouter.get('/:reference', async (req, res, next) => {
  try {
    const reference = String(req.params.reference).toUpperCase();
    if (!/^BC-[A-Z0-9]{6}$/.test(reference)) return res.status(404).json({ error: { code: 'COMMANDE_INTROUVABLE', message: 'Commande introuvable.' } });
    res.json({ order: await getOrderSummary(reference) });
  } catch (e) {
    next(e);
  }
});
