import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { requireFeature } from '../middlewares/feature.js';
import { getAppSettings, setAppSettings, settingsSchema } from '../services/app-settings.service.js';

// Réglages du logiciel : lus par le Patron et l'Opérateur (quel bouton afficher), changés par le Patron,
// si le Prestataire n'a pas fermé les réglages (lot 4)
export const staffSettingsRouter = Router();

staffSettingsRouter.get('/', requireStaff('PATRON', 'OPERATEUR'), async (req, res, next) => {
  try {
    res.json({ settings: await getAppSettings() });
  } catch (e) {
    next(e);
  }
});

staffSettingsRouter.put('/', requireStaff('PATRON'), requireFeature('REGLAGES'), async (req, res, next) => {
  try {
    res.json({ settings: await setAppSettings(settingsSchema.parse(req.body), req.staff) });
  } catch (e) {
    next(e);
  }
});
