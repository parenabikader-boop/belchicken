import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { photoBody, readPhoto } from '../middlewares/photo-body.js';
import { getHomePhotos, resetHomePhoto, setHomePhoto } from '../services/home.service.js';

// Photos de l'accueil : Patron seulement
export const staffHomeRouter = Router();
const patron = requireStaff('PATRON');

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

staffHomeRouter.get('/', patron, handle(async (req, res) => {
  res.json({ photos: await getHomePhotos() });
}));

staffHomeRouter.put('/:slot/photo', patron, readPhoto, handle(async (req, res) => {
  res.json({ photo: await setHomePhoto(req.params.slot, photoBody(req)) });
}));

// Retirer = remettre la photo d'origine (l'accueil garde toujours ses 3 photos)
staffHomeRouter.delete('/:slot/photo', patron, handle(async (req, res) => {
  res.json({ photo: await resetHomePhoto(req.params.slot) });
}));
