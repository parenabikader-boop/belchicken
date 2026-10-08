import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { deliveryChoiceSchema } from '../services/delivery-fees.js';
import { getPublicGrid, publicQuote, quoteFor } from '../services/delivery-fees.service.js';
import { locationSchema } from '../validators/order.schema.js';

// Frais de livraison pour le site public : quartiers proposés, puis aperçu des frais avant la validation.
// Le montant est toujours calculé ici ; il est recalculé à la commande.
export const deliveryRouter = Router();

deliveryRouter.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store'); // un prix changé par le Patron se voit tout de suite
    res.json(await getPublicGrid());
  } catch (e) {
    next(e);
  }
});

// Limite les appels abusifs, comme pour les commandes : 60 aperçus / 10 min par adresse IP
// (un client qui change plusieurs fois de quartier en fait quelques-uns)
const quoteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TROP_DE_DEMANDES', message: 'Trop de demandes de frais de livraison. Réessayez dans quelques minutes.' } },
});

const quoteSchema = deliveryChoiceSchema.omit({ expectedFee: true }).extend({ location: locationSchema.optional() });

deliveryRouter.post('/quote', quoteLimiter, async (req, res, next) => {
  try {
    const { location, ...choice } = quoteSchema.parse(req.body);
    res.json({ quote: publicQuote(await quoteFor(choice, location)) });
  } catch (e) {
    next(e);
  }
});
