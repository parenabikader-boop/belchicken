import { Router } from 'express';
import { getAppSettings } from '../services/app-settings.service.js';
import { getFeatures } from '../services/features.service.js';
import { SIMPLE_ORDER } from '../services/features.js';

// Réglages publics du site client. Rien d'autre : jamais les autres réglages (ceux de l'équipe restent privés).
// - anglais (lot 8) : bouton FR / EN affiché (réglage du Patron « Site en anglais », inclus par le Prestataire) ;
// - menuBorne (lot 11) : /menu en plein écran façon borne (réglage « Menu façon borne », interrupteur MENU_BORNE).
export const siteRouter = Router();

// Réponse de GET /api/site, d'après les réglages actifs (testé dans test/menu-borne-commandes.test.js)
// - commandeSimple (lot « Commande simplifiée ») : seulement quand l'interrupteur est ouvert ; fermé, la réponse d'avant.
export const publicSite = ({ englishSite, kioskMenu }, features = {}) => ({
  anglais: englishSite === true,
  menuBorne: kioskMenu === true,
  ...(features[SIMPLE_ORDER] === true && { commandeSimple: true }),
});

siteRouter.get('/', async (req, res, next) => {
  try {
    const [settings, features] = await Promise.all([getAppSettings(), getFeatures()]);
    res.set('Cache-Control', 'public, max-age=30');
    res.json(publicSite(settings, features));
  } catch (e) {
    next(e);
  }
});
