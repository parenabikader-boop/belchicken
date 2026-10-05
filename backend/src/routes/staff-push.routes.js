import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { pushStatus, sendTest, subscribe, unsubscribe } from '../services/push.service.js';

// Alertes sur téléphone : nouvelles commandes (Patron et Opérateur), nouvelles courses (Livreur)
export const staffPushRouter = Router();
staffPushRouter.use(requireStaff('PATRON', 'OPERATEUR', 'LIVREUR'));

// Services de notification des navigateurs (Chrome, Safari, Firefox, Edge). Le serveur
// n'envoie jamais rien ailleurs, même si une adresse inconnue lui est donnée.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

export const endpointSchema = z
  .string({ required_error: 'Adresse de notification manquante.' })
  .max(1000)
  .refine((u) => {
    try {
      const { protocol, hostname } = new URL(u);
      return protocol === 'https:' && PUSH_HOSTS.test(hostname);
    } catch {
      return false; // pas une adresse
    }
  }, 'Adresse de notification non reconnue.');

export const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffPushRouter.get('/', (req, res) => {
  res.json(pushStatus());
});

staffPushRouter.post('/subscribe', handle(async (req, res) => {
  await subscribe(req.staff, subscriptionSchema.parse(req.body), req.get('user-agent'));
  res.json({ ok: true });
}));

staffPushRouter.post('/unsubscribe', handle(async (req, res) => {
  await unsubscribe(z.object({ endpoint: endpointSchema }).parse(req.body).endpoint);
  res.json({ ok: true });
}));

staffPushRouter.post('/test', handle(async (req, res) => {
  await sendTest(req.staff, z.object({ endpoint: endpointSchema }).parse(req.body).endpoint);
  res.json({ ok: true });
}));
