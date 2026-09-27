import { Router } from 'express';
import { getPublicMenu } from '../services/menu.service.js';

export const menuRouter = Router();

menuRouter.get('/', async (req, res, next) => {
  try {
    const categories = await getPublicMenu();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ categories });
  } catch (e) {
    next(e);
  }
});
