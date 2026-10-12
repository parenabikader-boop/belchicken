import { Router } from 'express';
import { getAppSettings } from '../services/app-settings.service.js';

// Réglages publics du site client. Rien d'autre : jamais les autres réglages (ceux de l'équipe restent privés).
// - anglais (lot 8) : bouton FR / EN affiché (réglage du Patron « Site en anglais », inclus par le Prestataire) ;
// - menuBorne (lot 11) : /menu en plein écran façon borne (réglage « Menu façon borne », interrupteur MENU_BORNE).
export const siteRouter = Router();

// Réponse de GET /api/site, d'après les réglages actifs (testé dans test/menu-borne-commandes.test.js)
export const publicSite = ({ englishSite, kioskMenu }) => ({ anglais: englishSite === true, menuBorne: kioskMenu === true });

siteRouter.get('/', async (req, res, next) => {
  try {
    const settings = await getAppSettings();
    res.set('Cache-Control', 'public, max-age=30');
    res.json(publicSite(settings));
  } catch (e) {
    next(e);
  }
});
