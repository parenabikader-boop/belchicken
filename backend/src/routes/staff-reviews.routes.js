import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { getOrderReview, getReviews, markCalledBack } from '../services/review.service.js';

// Lot 7 : avis des clients (/api/staff/avis). Patron et Prestataire seulement (accessFor) ; jamais
// l'Opérateur, le Livreur ni le Responsable livraison (il a sa note de livraison sur /livraison/avis).
// Fermé par l'interrupteur AVIS : refusé pour tout le monde, Prestataire compris.
export const staffReviewsRouter = Router();
staffReviewsRouter.use(requireStaff('PATRON'));
staffReviewsRouter.use(requireFeature('AVIS'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffReviewsRouter.get('/', handle(async (req, res) => {
  res.json({ reviews: await getReviews({ du: String(req.query.du || ''), au: String(req.query.au || '') }) });
}));

// Avis d'une commande, pour son détail (null s'il n'y en a pas). À part de /orders, que l'Opérateur voit aussi.
staffReviewsRouter.get('/commande/:reference', handle(async (req, res) => {
  res.json({ review: await getOrderReview(String(req.params.reference).toUpperCase()) });
}));

// « Client rappelé » (note facultative), une seule fois, seulement pour un mauvais avis
staffReviewsRouter.post('/:id/rappel', handle(async (req, res) => {
  res.json({ review: await markCalledBack(req.params.id, req.body, req.staff) });
}));
