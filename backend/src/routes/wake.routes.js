import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { smsKeyMatches } from '../services/payment-sms.js';
import { runPatronTick } from '../services/patron-accounts.service.js';

// Compte Patron simplifié : réveil du serveur par un service gratuit (cron-job.org, toutes les 10 minutes). Chaque appel
// envoie au Patron ce qui est dû (résumé du soir, de la semaine, plat en rupture depuis longtemps), une seule fois.
// Clé secrète RESUME_PATRON_CLE (Render, au moins 24 caractères) : en-tête X-Cle, ou ?cle=… si le service ne sait pas
// ajouter d'en-tête. Clé vide ou fausse : 401. Interrupteur COMPTE_PATRON_SIMPLE fermé : 404, comme une adresse inconnue.
export const wakeRouter = Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TROP_DE_DEMANDES', message: 'Trop de demandes.' } },
});

// Même règle que la clé des SMS de paiement (au moins 24 caractères, comparaison à temps constant)
const wakeKey = (req) => req.get('x-cle') || String(req.query.cle || '');

const wake = async (req, res, next) => {
  try {
    if (!smsKeyMatches(wakeKey(req), env.patron.wakeKey)) {
      return res.status(401).json({ error: { code: 'CLE_INVALIDE', message: 'Clé invalide.' } });
    }
    const result = await runPatronTick();
    if (!result.open) return res.status(404).json({ error: { code: 'INTROUVABLE', message: 'Adresse inconnue.' } });
    res.json({ ok: true, migration: result.migration, sent: (result.done || []).map((d) => d.kind) });
  } catch (e) {
    next(e);
  }
};

wakeRouter.get('/', limiter, wake);
wakeRouter.post('/', limiter, wake);
