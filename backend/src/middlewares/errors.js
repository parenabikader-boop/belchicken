import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'INTROUVABLE', message: 'Ressource introuvable.' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return res.status(400).json({
      error: { code: 'DONNEES_INVALIDES', message: details[0]?.message || 'Données invalides.', details },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'JSON_INVALIDE', message: 'Requête mal formée.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'ERREUR_SERVEUR', message: 'Une erreur est survenue. Réessayez dans un instant.' } });
}
