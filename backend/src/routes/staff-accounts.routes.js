import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { getAccounts, getDigestSettings, saveDigestSettings, saveGoal } from '../services/patron-accounts.service.js';
import { accountsFileName, accountsWorkbook } from '../services/patron-accounts-excel.js';
import { digestSettingsSchema, goalSchema } from '../services/patron-digest.js';

// Compte Patron simplifié (/api/staff/comptes) : page Comptes, son export Excel et l'heure des résumés. Patron et
// Prestataire seulement ; jamais l'Opérateur, le Livreur ni le Responsable livraison (test/route-access.test.js).
// Fermé par l'interrupteur COMPTE_PATRON_SIMPLE : refusé pour tout le monde, Prestataire compris.
export const staffAccountsRouter = Router();
staffAccountsRouter.use(requireStaff('PATRON'));
staffAccountsRouter.use(requireFeature('COMPTE_PATRON_SIMPLE'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const query = (req) => ({ periode: String(req.query.periode || 'jour'), du: String(req.query.du || ''), au: String(req.query.au || '') });

staffAccountsRouter.get('/', handle(async (req, res) => {
  res.json({ comptes: await getAccounts(query(req)) });
}));

staffAccountsRouter.get('/excel', handle(async (req, res) => {
  const accounts = await getAccounts(query(req));
  const wb = await accountsWorkbook(accounts);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${accountsFileName(accounts)}"`);
  await wb.xlsx.write(res);
  res.end();
}));

staffAccountsRouter.get('/resumes', handle(async (req, res) => {
  res.json({ resumes: await getDigestSettings() });
}));

staffAccountsRouter.put('/resumes', handle(async (req, res) => {
  res.json({ resumes: await saveDigestSettings(digestSettingsSchema.parse(req.body), req.staff) });
}));

// Lot B : objectif de ventes du mois en cours (montant 0 = retiré)
staffAccountsRouter.put('/objectif', handle(async (req, res) => {
  res.json({ objectif: await saveGoal(goalSchema.parse(req.body).montant, req.staff) });
}));
