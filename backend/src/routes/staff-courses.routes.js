import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { deliverWithCode, deliverWithoutCode, listCourses } from '../services/courier.service.js';
import { isFeatureOpen } from '../services/features.service.js';
import { CALL_CENTER_LIGHT } from '../services/features.js';
import { myAvailability, setAvailability } from '../services/courier-team.service.js';
import { pickUp } from '../services/dispatch.service.js';
import { AVAILABILITIES } from '../services/courier-team.js';

// Espace livreur : ses courses seulement. Les autres routes de l'équipe lui sont fermées.
export const staffCoursesRouter = Router();
staffCoursesRouter.use(requireStaff('LIVREUR'));

staffCoursesRouter.get('/', async (req, res, next) => {
  try {
    // Plan 1 : noCodeAllowed seulement quand le call center est allégé (sinon la réponse est celle d'avant)
    const light = await isFeatureOpen(CALL_CENTER_LIGHT);
    res.json({ courses: await listCourses(req.staff), availability: await myAvailability(req.staff), serverTime: new Date(), ...(light && { noCodeAllowed: true }) });
  } catch (e) {
    next(e);
  }
});

// Lot 5b : le livreur se met Disponible ou En pause (si la disponibilité est active pour son équipe)
staffCoursesRouter.put('/disponibilite', async (req, res, next) => {
  try {
    const { availability } = z
      .object({ availability: z.enum(AVAILABILITIES, { errorMap: () => ({ message: 'Choisissez Disponible ou En pause.' }) }) })
      .parse(req.body);
    await setAvailability(req.staff, req.staff.id, availability, 'self');
    res.json({ availability: await myAvailability(req.staff) });
  } catch (e) {
    next(e);
  }
});

// Lot 5c : « Commande récupérée » (commande de notre partenaire, prête au restaurant)
staffCoursesRouter.post('/:reference/recuperee', async (req, res, next) => {
  try {
    const reference = String(req.params.reference).toUpperCase();
    await pickUp(req.staff, reference, { byCourier: true });
    res.json({ course: (await listCourses(req.staff)).find((c) => c.reference === reference) });
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
    const { code, feeMethod } = z
      .object({
        code: z.string({ required_error: 'Tapez le code du client.' }).max(20),
        // Comment le client a payé les frais de livraison (vérifié dans le service)
        feeMethod: z.string().max(20).optional(),
      })
      .parse(req.body);
    res.json({ course: await deliverWithCode(String(req.params.reference).toUpperCase(), code, feeMethod, req.staff) });
  } catch (e) {
    next(e);
  }
});

// Plan 1 (interrupteur CALL_CENTER_ALLEGE ouvert, sinon 403) : client sans son code, le livreur valide avec un motif
staffCoursesRouter.post('/:reference/sans-code', codeLimiter, async (req, res, next) => {
  try {
    const { reason, feeMethod } = z
      .object({
        reason: z.string({ required_error: 'Indiquez pourquoi la livraison est validée sans code.' }).max(300, 'Motif trop long (300 caractères au plus).'),
        feeMethod: z.string().max(20).optional(),
      })
      .parse(req.body);
    res.json({ course: await deliverWithoutCode(String(req.params.reference).toUpperCase(), reason, feeMethod, req.staff) });
  } catch (e) {
    next(e);
  }
});
