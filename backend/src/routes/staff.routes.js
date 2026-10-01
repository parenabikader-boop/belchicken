import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';
import { readSessionToken, requireStaff, sessionCookie } from '../middlewares/staff-auth.js';
import { login, logout, toPublicStaff } from '../services/staff.service.js';

export const staffRouter = Router();

// Rien de l'espace équipe ne doit rester en cache (navigateur, proxy)
staffRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const tooMany = { error: { code: 'TROP_DE_TENTATIVES', message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' } };
const limiter = (options) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true, // seules les tentatives ratées comptent
    message: tooMany,
    ...options,
  });
// 20 essais ratés / 15 min par adresse IP, et 8 essais ratés / 15 min par numéro (quel que soit l'appareil)
const ipLimiter = limiter({ limit: 20 });
const phoneLimiter = limiter({
  limit: 8,
  keyGenerator: (req) => `tel:${normalizePhone(req.body?.phone) || 'invalide'}`,
});

const loginSchema = z.object({
  phone: z.string({ required_error: 'Indiquez votre numéro de téléphone.' }).max(30),
  password: z.string({ required_error: 'Indiquez votre mot de passe.' }).min(1, 'Indiquez votre mot de passe.').max(200),
});

const WRONG = { error: { code: 'IDENTIFIANTS_INCORRECTS', message: 'Numéro ou mot de passe incorrect.' } };

staffRouter.post('/login', ipLimiter, phoneLimiter, async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(401).json(WRONG);
    const session = await login(normalized, password, req.get('user-agent'));
    if (!session) return res.status(401).json(WRONG);
    res.set('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    res.json({ user: toPublicStaff(session.user) });
  } catch (e) {
    next(e);
  }
});

staffRouter.post('/logout', async (req, res, next) => {
  try {
    await logout(readSessionToken(req));
    res.set('Set-Cookie', sessionCookie('', null));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

staffRouter.get('/me', requireStaff(), (req, res) => {
  res.json({ user: toPublicStaff(req.staff) });
});
