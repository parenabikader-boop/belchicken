import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requestMeta } from '../services/security-log.service.js';
import {
  createDeliveryMember, deliveryMemberAction, getDeliveryOverview, listDeliveryTeam, setAvailability,
} from '../services/courier-team.service.js';
import { AVAILABILITIES } from '../services/courier-team.js';
import { getCash, remitCash } from '../services/cash.service.js';
import { markFeeVerified } from '../services/staff-orders.service.js';
import { createDeliveryMemberSchema, provisionalPasswordSchema } from '../services/team.js';

// Lot 5b : page Livraison, notre équipe de livraison. Responsable livraison et Prestataire seulement.
// Rien ici ne montre les ventes de Belchicken : seulement nos livreurs, nos courses (frais de livraison)
// et notre caisse (commandes en mode Prestataire).
export const staffDeliveryTeamRouter = Router();
staffDeliveryTeamRouter.use(requireStaff('RESPONSABLE_LIVRAISON', 'PRESTATAIRE'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffDeliveryTeamRouter.get('/', handle(async (req, res) => {
  res.json(await getDeliveryOverview());
}));

staffDeliveryTeamRouter.put('/livreurs/:id/disponibilite', handle(async (req, res) => {
  const { availability } = z
    .object({ availability: z.enum(AVAILABILITIES, { errorMap: () => ({ message: 'Choisissez Disponible ou En pause.' }) }) })
    .parse(req.body);
  await setAvailability(req.staff, String(req.params.id), availability, 'livraison');
  res.json(await getDeliveryOverview());
}));

// ─── Comptes de notre équipe (chaque action notée au journal de sécurité, COMPTE_LIVRAISON) ───

staffDeliveryTeamRouter.get('/equipe', handle(async (req, res) => {
  res.json({ members: await listDeliveryTeam(req.staff) });
}));

staffDeliveryTeamRouter.post('/equipe', handle(async (req, res) => {
  res.status(201).json({ member: await createDeliveryMember(req.staff, createDeliveryMemberSchema.parse(req.body), requestMeta(req)) });
}));

staffDeliveryTeamRouter.post('/equipe/:id/password', handle(async (req, res) => {
  const { password } = provisionalPasswordSchema.parse(req.body);
  res.json({ member: await deliveryMemberAction(req.staff, String(req.params.id), 'reset', password, requestMeta(req)) });
}));

staffDeliveryTeamRouter.post('/equipe/:id/deactivate', handle(async (req, res) => {
  res.json({ member: await deliveryMemberAction(req.staff, String(req.params.id), 'deactivate', null, requestMeta(req)) });
}));

staffDeliveryTeamRouter.post('/equipe/:id/reactivate', handle(async (req, res) => {
  const { password } = provisionalPasswordSchema.parse(req.body);
  res.json({ member: await deliveryMemberAction(req.staff, String(req.params.id), 'reactivate', password, requestMeta(req)) });
}));

// ─── Notre caisse : frais des commandes en mode Prestataire (jamais celles du restaurant) ───

staffDeliveryTeamRouter.get('/caisse', handle(async (req, res) => {
  res.json({ ...(await getCash('PRESTATAIRE')), serverTime: new Date() });
}));

const remitSchema = z.object({
  courierId: z.string({ required_error: 'Choisissez le livreur.' }).max(40),
  references: z.array(z.string().max(20)).max(200),
});

staffDeliveryTeamRouter.post('/caisse/remises', handle(async (req, res) => {
  const { courierId, references } = remitSchema.parse(req.body);
  res.json(await remitCash({ courierId, references: references.map((r) => r.toUpperCase()) }, req.staff, 'PRESTATAIRE'));
}));

// Frais payés par mobile money sur nos codes : vérifiés (ou non) sur notre téléphone marchand
staffDeliveryTeamRouter.post('/caisse/:reference/verifie', handle(async (req, res) => {
  const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
  await markFeeVerified(String(req.params.reference).toUpperCase(), verified, req.staff, 'PRESTATAIRE');
  res.json({ ...(await getCash('PRESTATAIRE')), serverTime: new Date() });
}));
