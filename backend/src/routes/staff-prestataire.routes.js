import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { listFeatures, setFeature } from '../services/features.service.js';
import { listSecurityLog, requestMeta } from '../services/security-log.service.js';

// Page Prestataire (lot 4) : interrupteurs des fonctions et journal de sécurité, Prestataire seulement.
// Le journal se lit ici et ne se modifie nulle part.
export const staffPrestataireRouter = Router();
staffPrestataireRouter.use(requireStaff('PRESTATAIRE'));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffPrestataireRouter.get('/fonctions', handle(async (req, res) => {
  res.json({ features: await listFeatures() });
}));

staffPrestataireRouter.put('/fonctions/:key', handle(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean({ required_error: 'Ouvrir ou fermer ?' }) }).parse(req.body);
  res.json({ features: await setFeature(String(req.params.key), enabled, req.staff, requestMeta(req)) });
}));

staffPrestataireRouter.get('/journal', handle(async (req, res) => {
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(req.query.page);
  res.json(await listSecurityLog(page));
}));
