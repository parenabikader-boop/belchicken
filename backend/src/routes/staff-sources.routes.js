import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { sourceActiveSchema, sourceInputSchema } from '../services/order-sources.js';
import { createSource, deleteSource, listSources, reorderSources, setSourceActive, updateSource } from '../services/order-sources.service.js';

// Provenances des commandes (lot 2), réglées par le Patron dans Réglages. Chaque appel renvoie la liste à jour.
export const staffSourcesRouter = Router();
staffSourcesRouter.use(requireStaff('PATRON'), requireFeature('REGLAGES')); // fonction fermable (lot 4)

const reply = (fn) => async (req, res, next) => {
  try {
    res.json({ sources: await fn(req) });
  } catch (e) {
    next(e);
  }
};

staffSourcesRouter.get('/', reply(() => listSources()));
staffSourcesRouter.post('/', reply((req) => createSource(sourceInputSchema.parse(req.body))));
staffSourcesRouter.put('/order', reply((req) => reorderSources(z.object({ ids: z.array(z.string().max(40)).max(50) }).parse(req.body).ids)));
staffSourcesRouter.put('/:id', reply((req) => updateSource(req.params.id, sourceInputSchema.parse(req.body))));
staffSourcesRouter.patch('/:id/active', reply((req) => setSourceActive(req.params.id, sourceActiveSchema.parse(req.body).isActive)));
staffSourcesRouter.delete('/:id', reply((req) => deleteSource(req.params.id)));
