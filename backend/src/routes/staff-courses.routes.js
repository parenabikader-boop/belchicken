import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { deliverWithCode, listCourses } from '../services/courier.service.js';

// Espace livreur : ses courses seulement. Les autres routes de l'équipe lui sont fermées.
export const staffCoursesRouter = Router();
staffCoursesRouter.use(requireStaff('LIVREUR'));

staffCoursesRouter.get('/', async (req, res, next) => {
  try {
    res.json({ courses: await listCourses(req.staff), serverTime: new Date() });
  } catch (e) {
    next(e);
  }
});

// En plus des 5 essais par commande : 30 essais / 15 min par livreur, toutes commandes confondues
const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `livreur:${req.staff.id}`,
  message: { error: { code: 'TROP_DE_TENTATIVES', message: 'Trop de codes tapés. Réessayez dans 15 minutes ou appelez l’équipe.' } },
});

staffCoursesRouter.post('/:reference/deliver', codeLimiter, async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string({ required_error: 'Tapez le code du client.' }).max(20) }).parse(req.body);
    res.json({ course: await deliverWithCode(String(req.params.reference).toUpperCase(), code, req.staff) });
  } catch (e) {
    next(e);
  }
});
