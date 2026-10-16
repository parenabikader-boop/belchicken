import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ligdicashCallback, receiveSms } from '../services/auto-payment.service.js';
import { smsBodySchema, smsKeyMatches } from '../services/payment-sms.js';

// Plan 2 : paiement du repas validé automatiquement (/sms : interrupteur PAIEMENT_AUTO_SMS ; /ligdicash :
// interrupteur PAIEMENT_LIGDICASH ; fermé = 404, comme une adresse inconnue).
export const paymentAutoRouter = Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TROP_DE_DEMANDES', message: 'Trop de demandes.' } },
});

// Clé de l'application Android : en-tête X-Cle-Sms (conseillé), ou Authorization: Bearer …, ou ?cle=… si l'application
// ne sait pas ajouter d'en-tête. Variable Render SMS_PAIEMENT_CLE (au moins 24 caractères) ; vide = adresse fermée.
const smsKey = (req) => req.get('x-cle-sms') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || String(req.query.cle || '');

// Corps JSON lu même si l'application l'annonce comme texte (Content-Type text/plain ou absent) ;
// déjà lu par express.json() quand il est annoncé en JSON. Heure de réception = arrivée sur le serveur.
const smsJson = express.json({ limit: '100kb', type: () => true });

// SMS reçu par le téléphone marchand ECOFOOD, transmis par l'application Android (« Transitaire SMS »)
paymentAutoRouter.post('/sms', limiter, smsJson, async (req, res, next) => {
  try {
    if (!smsKeyMatches(smsKey(req), env.autoPayment.smsKey)) {
      return res.status(401).json({ error: { code: 'CLE_INVALIDE', message: 'Clé invalide.' } });
    }
    res.json(await receiveSms(smsBodySchema.parse(req.body)));
  } catch (e) {
    next(e);
  }
});

// Ligdicash (préparé) : envoie le même message deux fois, en JSON et en formulaire. Réponse toujours rapide.
paymentAutoRouter.post('/ligdicash', limiter, express.urlencoded({ extended: true }), async (req, res, next) => {
  try {
    res.json(await ligdicashCallback(req.body || {}));
  } catch (e) {
    next(e);
  }
});
