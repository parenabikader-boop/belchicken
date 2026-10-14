import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { createMemberSchema, independentMemberError, provisionalPasswordSchema } from '../services/team.js';
import { isFeatureOpen } from '../services/features.service.js';
import { AppError } from '../utils/AppError.js';
import { createMember, deactivate, listMembers, reactivate, resetPassword } from '../services/team.service.js';

// Page Équipe : comptes de l'équipe, Patron seulement
export const staffTeamRouter = Router();
staffTeamRouter.use(requireStaff('PATRON'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffTeamRouter.get('/', handle(async (req, res) => {
  res.json({ members: await listMembers() });
}));

// Livreur « Indépendant » : seulement avec l'interrupteur LIVREURS_INDEPENDANTS ouvert
staffTeamRouter.post('/', handle(async (req, res) => {
  const { independent, ...input } = createMemberSchema.parse(req.body);
  const error = independentMemberError({ role: input.role, independent }, independent ? await isFeatureOpen('LIVREURS_INDEPENDANTS') : false);
  if (error) throw new AppError(400, error, 'COMPTE_IMPOSSIBLE');
  res.status(201).json({ member: await createMember(input, independent ? 'INDEPENDANT' : 'RESTAURANT') });
}));

staffTeamRouter.post('/:id/password', handle(async (req, res) => {
  const { password } = provisionalPasswordSchema.parse(req.body);
  res.json({ member: await resetPassword(req.staff, req.params.id, password) });
}));

staffTeamRouter.post('/:id/deactivate', handle(async (req, res) => {
  res.json({ member: await deactivate(req.staff, req.params.id) });
}));

staffTeamRouter.post('/:id/reactivate', handle(async (req, res) => {
  const { password } = provisionalPasswordSchema.parse(req.body);
  res.json({ member: await reactivate(req.staff, req.params.id, password) });
}));
