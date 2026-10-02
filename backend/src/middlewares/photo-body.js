import express from 'express';
import { MAX_PHOTO_BYTES } from '../services/photo.service.js';

// Photos : le fichier est envoyé tel quel dans le corps de la requête (Content-Type image/...),
// sans formulaire multipart. Le format réel est vérifié par photo.service.js.
export const readPhoto = (req, res, next) =>
  express.raw({ type: () => true, limit: MAX_PHOTO_BYTES })(req, res, (err) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PHOTO_TROP_LOURDE', message: `Photo trop lourde. Maximum ${MAX_PHOTO_BYTES / 1024 / 1024} Mo.` } });
    }
    next(err);
  });

export const photoBody = (req) => (Buffer.isBuffer(req.body) ? req.body : null);
