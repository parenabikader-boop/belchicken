import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { getSales } from '../services/sales.service.js';
import { salesFileName, salesWorkbook } from '../services/sales-excel.js';

// Lot 6 : ventes par période (/api/staff/ventes). Patron et Prestataire seulement (accessFor) ; jamais
// l'Opérateur, le Livreur ni le Responsable livraison (test/route-access.test.js). Fermé par l'interrupteur
// VENTES : refusé pour tout le monde, Prestataire compris.
export const staffSalesRouter = Router();
staffSalesRouter.use(requireStaff('PATRON'));
staffSalesRouter.use(requireFeature('VENTES'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const period = (req) => ({ du: String(req.query.du || ''), au: String(req.query.au || '') });

staffSalesRouter.get('/', handle(async (req, res) => {
  res.json({ sales: await getSales(period(req)) });
}));

staffSalesRouter.get('/excel', handle(async (req, res) => {
  const sales = await getSales(period(req), { withOrders: true });
  const wb = await salesWorkbook(sales);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${salesFileName(sales)}"`);
  await wb.xlsx.write(res);
  res.end();
}));
