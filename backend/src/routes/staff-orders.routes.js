import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import {
  changeStatus, confirmNotice, getOrder, listCouriers, listOrders, logMessagePrepared, reassignCourier, setDeliveryFee, setFeeVerified,
} from '../services/staff-orders.service.js';
import { MESSAGE_KEYS } from '../services/customer-messages.js';
import { FEE_MAX, FEE_METHODS, FEE_MIN, STATUSES } from '../services/order-status.js';

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

// Livreurs à choisir au départ d'une commande (avant /:reference)
staffOrdersRouter.get('/livreurs', async (req, res, next) => {
  try {
    res.json({ couriers: await listCouriers() });
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
  // Motif d'annulation, ou de livraison validée sans code
  reason: z.string().max(300, 'Motif trop long (300 caractères au plus).').optional(),
  // Livreur choisi au départ (to = EN_LIVRAISON)
  courierId: z.string().max(40).optional(),
  // Frais de livraison donnés avec la confirmation du paiement (to = PAYEE)
  deliveryFee: z.number({ invalid_type_error: 'Indiquez les frais de livraison en F.' }).int('Montant en F, sans centimes.').optional(),
  // Livraison validée sans code (to = LIVREE) : comment le client a payé les frais au livreur
  feeMethod: z
    .enum(FEE_METHODS, { errorMap: () => ({ message: 'Indiquez comment le client a payé les frais de livraison : espèces ou mobile money.' }) })
    .optional(),
});

staffOrdersRouter.post('/:reference/status', async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    res.json({ order: await changeStatus(reference(req), input, req.staff) });
  } catch (e) {
    next(e);
  }
});

// Frais de livraison (Patron et Opérateur) : montant selon le quartier, avant le départ du livreur
export const feeSchema = z.object({
  amount: z
    .number({ required_error: 'Indiquez le montant des frais.', invalid_type_error: 'Indiquez le montant des frais en F.' })
    .int('Montant en F, sans centimes.')
    .min(FEE_MIN, 'Les frais de livraison doivent être d’au moins 1 F.')
    .max(FEE_MAX, 'Montant trop élevé (50 000 F au plus).'),
});

staffOrdersRouter.put('/:reference/delivery-fee', async (req, res, next) => {
  try {
    const { amount } = feeSchema.parse(req.body);
    res.json({ order: await setDeliveryFee(reference(req), amount, req.staff) });
  } catch (e) {
    next(e);
  }
});

// Frais payés par mobile money : vérifiés (ou non) sur le téléphone marchand
staffOrdersRouter.post('/:reference/delivery-fee/verified', async (req, res, next) => {
  try {
    const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
    res.json({ order: await setFeeVerified(reference(req), verified, req.staff) });
  } catch (e) {
    next(e);
  }
});

// Message WhatsApp ouvert par l'agent : noté dans l'historique
staffOrdersRouter.post('/:reference/messages', async (req, res, next) => {
  try {
    const { key } = z.object({ key: z.string().max(40) }).parse(req.body);
    await logMessagePrepared(reference(req), key, req.staff);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// L'agent confirme que le client est prévenu de l'étape en cours (débloque l'étape suivante)
const noticeSchema = z.object({
  key: z.enum(MESSAGE_KEYS, { errorMap: () => ({ message: 'Message inconnu.' }) }),
  by: z.enum(['WHATSAPP', 'APPEL']).default('WHATSAPP'),
});

staffOrdersRouter.post('/:reference/notice', async (req, res, next) => {
  try {
    res.json({ order: await confirmNotice(reference(req), noticeSchema.parse(req.body), req.staff) });
  } catch (e) {
    next(e);
  }
});

// Remplacement du livreur pendant la livraison
staffOrdersRouter.put('/:reference/courier', async (req, res, next) => {
  try {
    const { courierId } = z.object({ courierId: z.string({ required_error: 'Choisissez le livreur.' }).max(40) }).parse(req.body);
    res.json({ order: await reassignCourier(reference(req), courierId, req.staff) });
  } catch (e) {
    next(e);
  }
});
