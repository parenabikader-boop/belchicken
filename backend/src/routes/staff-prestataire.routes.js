import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middlewares/staff-auth.js';
import { listFeatures, setFeature } from '../services/features.service.js';
import { listSecurityLog, requestMeta } from '../services/security-log.service.js';
import { getCompanyPage, updateCompany } from '../services/delivery-mode.service.js';
import { OPERATORS } from '../services/delivery-mode.js';

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

// Lot 5 : mode de livraison (Restaurant / Prestataire), notre société et nos codes marchands.
// Mode Prestataire refusé tant que la société, le nom affiché et les 3 codes ne sont pas remplis.
staffPrestataireRouter.get('/livraison', handle(async (req, res) => {
  res.json(await getCompanyPage());
}));

const text = z.string().max(200).nullable().optional();
const companySchema = z.object({
  mode: z.enum(OPERATORS, { errorMap: () => ({ message: 'Choisissez le mode : Restaurant ou Prestataire.' }) }).optional(),
  companyName: text,
  merchantName: text,
  orangeCode: text,
  moovCode: text,
  telecelCode: text,
});

staffPrestataireRouter.put('/livraison', handle(async (req, res) => {
  res.json(await updateCompany(companySchema.parse(req.body), req.staff, requestMeta(req)));
}));
