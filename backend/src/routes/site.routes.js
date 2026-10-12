import { Router } from 'express';
import { getAppSettings } from '../services/app-settings.service.js';

// Lot 8 : réglages publics du site client. { anglais } : bouton FR / EN affiché (réglage du Patron
// « Site en anglais », inclus par le Prestataire). Rien d'autre : jamais les autres réglages.
export const siteRouter = Router();

siteRouter.get('/', async (req, res, next) => {
  try {
    const { englishSite } = await getAppSettings();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ anglais: englishSite });
  } catch (e) {
    next(e);
  }
});
