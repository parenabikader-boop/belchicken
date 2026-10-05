import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { createMemberSchema, provisionalPasswordSchema } from '../services/team.js';
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

staffTeamRouter.post('/', handle(async (req, res) => {
  res.status(201).json({ member: await createMember(createMemberSchema.parse(req.body)) });
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
