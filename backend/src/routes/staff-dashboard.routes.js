import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { dashboardQuerySchema } from '../services/dashboard.js';
import { getDashboard } from '../services/dashboard.service.js';

// Tableau de bord : Patron seulement (chiffre d'affaires)
export const staffDashboardRouter = Router();

staffDashboardRouter.get('/', requireStaff('PATRON'), async (req, res, next) => {
  try {
    res.json(await getDashboard(dashboardQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});
