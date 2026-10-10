import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { dashboardQuerySchema } from '../services/dashboard.js';
import { getDashboard } from '../services/dashboard.service.js';

// Tableau de bord : Patron seulement (chiffre d'affaires), si le Prestataire ne l'a pas fermé (lot 4)
export const staffDashboardRouter = Router();

staffDashboardRouter.get('/', requireStaff('PATRON'), requireFeature('TABLEAU_DE_BORD'), async (req, res, next) => {
  try {
    res.json(await getDashboard(dashboardQuerySchema.parse(req.query)));
  } catch (e) {
    next(e);
  }
});
