import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { cashFor } from '../services/cash.js';
import { getCash, remitCash } from '../services/cash.service.js';

// Page Caisse : Patron et Opérateur pour les frais à vérifier (mobile money, constatés sur le téléphone marchand).
// Les espèces des livreurs et « Espèces remises » : Patron seulement. Le call center ne touche jamais d'espèces.
export const staffCashRouter = Router();
staffCashRouter.use(requireStaff('PATRON', 'OPERATEUR'), requireFeature('CAISSE')); // fonction fermable (lot 4)

staffCashRouter.get('/', async (req, res, next) => {
  try {
    res.json({ ...cashFor(await getCash(), req.staff.role), serverTime: new Date() });
  } catch (e) {
    next(e);
  }
});

const remitSchema = z.object({
  courierId: z.string({ required_error: 'Choisissez le livreur.' }).max(40),
  references: z.array(z.string().max(20)).max(200),
});

// « Espèces remises » par un livreur : Patron seulement (jamais l'Opérateur)
staffCashRouter.post('/remises', requireStaff('PATRON'), async (req, res, next) => {
  try {
    const { courierId, references } = remitSchema.parse(req.body);
    res.json(await remitCash({ courierId, references: references.map((r) => r.toUpperCase()) }, req.staff));
  } catch (e) {
    next(e);
  }
});
