import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createOrderSchema } from '../validators/order.schema.js';
import { createOrder, getOrderSummary, toPublicOrder } from '../services/order.service.js';
import { messageContextFor } from '../services/delivery-mode.service.js';
import { subscribeCustomer } from '../services/customer-push.service.js';
import { customerSubscriptionSchema } from '../services/tracking.js';

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
    // Plan 4 : avec le suivi sans WhatsApp, la clé du lien de suivi est donnée ici, une seule fois
    res.status(201).json({ order: toPublicOrder(order, await messageContextFor(order), { open: Boolean(order.trackingKey), fresh: true }) });
  } catch (e) {
    next(e);
  }
});

const REFERENCE_RE = /^BC-[A-Z0-9]{6}$/;
const notFound = (res) => res.status(404).json({ error: { code: 'COMMANDE_INTROUVABLE', message: 'Commande introuvable.' } });

orderRouter.get('/:reference', async (req, res, next) => {
  try {
    const reference = String(req.params.reference).toUpperCase();
    if (!REFERENCE_RE.test(reference)) return notFound(res);
    // Plan 4 : clé du lien de suivi dans un en-tête (jamais dans l'adresse demandée au serveur, qui peut être notée)
    res.json({ order: await getOrderSummary(reference, { key: req.get('x-suivi-cle') || null }) });
  } catch (e) {
    next(e);
  }
});

// Plan 4 : alertes sur le téléphone du client (suivi sans WhatsApp actif, avec la clé du lien). 20 demandes / 10 min.
const alertsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TROP_DE_DEMANDES', message: 'Trop de demandes. Réessayez dans quelques minutes.' } },
});

orderRouter.post('/:reference/alertes', alertsLimiter, async (req, res, next) => {
  try {
    const reference = String(req.params.reference).toUpperCase();
    if (!REFERENCE_RE.test(reference)) return notFound(res);
    await subscribeCustomer(reference, customerSubscriptionSchema.parse(req.body));
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
