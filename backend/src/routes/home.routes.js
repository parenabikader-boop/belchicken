import { Router } from 'express';
import { getHomePhotos } from '../services/home.service.js';

// Accueil du site : les 3 photos de la mosaïque
export const homeRouter = Router();

homeRouter.get('/', async (req, res, next) => {
  try {
    const photos = (await getHomePhotos()).map(({ slot, imageUrl, alt }) => ({ slot, imageUrl, alt }));
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ photos });
  } catch (e) {
    next(e);
  }
});
