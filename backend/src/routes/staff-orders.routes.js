import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { changeStatus, getOrder, listOrders } from '../services/staff-orders.service.js';
import { STATUSES } from '../services/order-status.js';

// Commandes de l'espace équipe : Patron et Opérateur
export const staffOrdersRouter = Router();
staffOrdersRouter.use(requireStaff('PATRON', 'OPERATEUR'));

const reference = (req) => String(req.params.reference).toUpperCase();

staffOrdersRouter.get('/', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : undefined;
    res.json({ ...(await listOrders({ status, q })), serverTime: new Date() });
  } catch (e) {
    next(e);
  }
});

staffOrdersRouter.get('/:reference', async (req, res, next) => {
  try {
    res.json({ order: await getOrder(reference(req)) });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({
  from: z.enum(STATUSES).optional(),
  to: z.enum(STATUSES, { errorMap: () => ({ message: 'Statut inconnu.' }) }),
  reason: z.string().max(300, 'Motif trop long (300 caractères au plus).').optional(),
});

staffOrdersRouter.post('/:reference/status', async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    res.json({ order: await changeStatus(reference(req), input, req.staff) });
  } catch (e) {
    next(e);
  }
});
