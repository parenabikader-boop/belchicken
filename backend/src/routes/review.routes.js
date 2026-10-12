import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPublicReview, submitReview } from '../services/review.service.js';

// Lot 7 : page publique de l'avis (/api/avis/:cle). La clé de 22 caractères est le seul moyen d'y arriver :
// jamais la référence seule. Rien sur le client sauf son prénom, jamais de montant.
export const reviewRouter = Router();

const limiter = (limit) =>
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'TROP_DE_DEMANDES', message: 'Trop d’essais. Réessayez dans quelques minutes.' } },
  });

reviewRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

reviewRouter.get('/:token', limiter(60), async (req, res, next) => {
  try {
    res.json({ review: await getPublicReview(String(req.params.token)) });
  } catch (e) {
    next(e);
  }
});

reviewRouter.post('/:token', limiter(10), async (req, res, next) => {
  try {
    res.status(201).json({ review: await submitReview(String(req.params.token), req.body) });
  } catch (e) {
    next(e);
  }
});
