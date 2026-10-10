import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';
import {
  challengeCookie, readChallengeToken, readSessionToken, requireStaffSession, sessionCookie,
} from '../middlewares/staff-auth.js';
import { login, logout, toPublicStaff } from '../services/staff.service.js';
import { checkCodeForPasswordChange, codeStep } from '../services/prestataire.service.js';
import { PRESTATAIRE_PASSWORD_MIN } from '../services/prestataire-auth.js';
import { getFeatures } from '../services/features.service.js';
import { requestMeta } from '../services/security-log.service.js';
import { staffPrestataireRouter } from './staff-prestataire.routes.js';
import { staffOrdersRouter } from './staff-orders.routes.js';
import { staffMenuRouter } from './staff-menu.routes.js';
import { staffHomeRouter } from './staff-home.routes.js';
import { staffDashboardRouter } from './staff-dashboard.routes.js';
import { staffPushRouter } from './staff-push.routes.js';
import { staffTeamRouter } from './staff-team.routes.js';
import { staffCoursesRouter } from './staff-courses.routes.js';
import { staffCashRouter } from './staff-cash.routes.js';
import { staffDeliveryFeesRouter } from './staff-delivery-fees.routes.js';
import { staffSettingsRouter } from './staff-settings.routes.js';
import { staffSourcesRouter } from './staff-sources.routes.js';
import { ownPasswordSchema } from '../services/team.js';
import { changeOwnPassword } from '../services/team.service.js';

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
// Lot 4 : compte Prestataire bloqué après 5 essais ratés (gardé en base)
const LOCKED = { error: { code: 'TROP_DE_TENTATIVES', message: 'Trop d’essais ratés. Réessayez plus tard.' } };

staffRouter.post('/login', ipLimiter, phoneLimiter, async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(401).json(WRONG);
    const session = await login(normalized, password, requestMeta(req));
    if (!session) return res.status(401).json(WRONG);
    if (session.locked) return res.status(429).json(LOCKED);
    // Prestataire : mot de passe juste, le code à 6 chiffres est demandé ensuite (aucune session encore)
    if (session.challenge) {
      res.set('Set-Cookie', challengeCookie(session.challenge, session.expiresAt));
      return res.json({ codeRequired: true });
    }
    res.set('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    res.json({ user: toPublicStaff(session.user) });
  } catch (e) {
    next(e);
  }
});

// Lot 4 : second temps de la connexion du Prestataire, code à 6 chiffres ou code de secours
const codeSchema = z.object({ code: z.string({ required_error: 'Tapez le code.' }).min(1, 'Tapez le code.').max(40) });

staffRouter.post('/login/code', ipLimiter, async (req, res, next) => {
  try {
    const { code } = codeSchema.parse(req.body);
    const result = await codeStep(readChallengeToken(req), code, requestMeta(req));
    if (result?.expired) {
      res.set('Set-Cookie', challengeCookie('', null));
      return res.status(401).json({ error: { code: 'CODE_EXPIRE', message: 'Délai dépassé : reconnectez-vous avec votre mot de passe.' } });
    }
    if (result?.locked) {
      res.set('Set-Cookie', challengeCookie('', null));
      return res.status(429).json(LOCKED);
    }
    if (!result) return res.status(401).json({ error: { code: 'CODE_INCORRECT', message: 'Code incorrect.' } });
    res.append('Set-Cookie', challengeCookie('', null));
    res.append('Set-Cookie', sessionCookie(result.token, result.expiresAt));
    res.json({ user: toPublicStaff(result.user) });
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

// features (lot 4) : fonctions ouvertes, pour cacher les pages fermées par le Prestataire
staffRouter.get('/me', requireStaffSession(), async (req, res, next) => {
  try {
    res.json({ user: toPublicStaff(req.staff), features: await getFeatures() });
  } catch (e) {
    next(e);
  }
});

// Changer son propre mot de passe (tout membre, y compris avec un mot de passe provisoire).
// 8 essais ratés / 15 min par compte : l'ancien mot de passe ne se devine pas depuis un téléphone resté ouvert.
const passwordLimiter = limiter({
  limit: 8,
  keyGenerator: (req) => `compte:${req.staff.id}`,
  message: { error: { code: 'TROP_DE_TENTATIVES', message: 'Trop d’essais. Réessayez dans 15 minutes.' } },
});

staffRouter.post('/password', requireStaffSession(), passwordLimiter, async (req, res, next) => {
  try {
    const prestataire = req.staff.role === 'PRESTATAIRE';
    const body = ownPasswordSchema(req.staff.mustChangePassword, prestataire ? PRESTATAIRE_PASSWORD_MIN : undefined).parse(req.body);
    // Lot 4 : le Prestataire tape aussi son code à 6 chiffres (ou un code de secours)
    if (prestataire && !(await checkCodeForPasswordChange(req.staff, body.code, requestMeta(req)))) {
      return res.status(400).json({ error: { code: 'CODE_INCORRECT', message: 'Code incorrect.' } });
    }
    const user = await changeOwnPassword(req.staff, readSessionToken(req), body);
    res.json({ user: toPublicStaff(user) });
  } catch (e) {
    next(e);
  }
});

staffRouter.use('/orders', staffOrdersRouter);
staffRouter.use('/menu', staffMenuRouter);
staffRouter.use('/home', staffHomeRouter);
staffRouter.use('/dashboard', staffDashboardRouter);
staffRouter.use('/push', staffPushRouter);
staffRouter.use('/team', staffTeamRouter);
staffRouter.use('/courses', staffCoursesRouter); // espace livreur
staffRouter.use('/caisse', staffCashRouter);
staffRouter.use('/frais-livraison', staffDeliveryFeesRouter); // grille des frais (Patron)
staffRouter.use('/reglages', staffSettingsRouter); // réglages du logiciel (lus par l'équipe, changés par le Patron)
staffRouter.use('/provenances', staffSourcesRouter); // provenances des commandes (Patron, lot 2)
staffRouter.use('/prestataire', staffPrestataireRouter); // interrupteurs et journal (Prestataire, lot 4)
