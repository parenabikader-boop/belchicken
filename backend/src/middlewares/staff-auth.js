import { env } from '../config/env.js';
import { getSessionUser } from '../services/staff.service.js';
import { isPrestataire } from '../services/roles.js';

export const SESSION_COOKIE = 'bc_equipe';
// Le cookie n'est envoyé qu'aux routes de l'espace équipe, jamais au reste de l'API
const COOKIE_PATH = '/api/staff';

// "a=1; b=2" -> { a: '1', b: '2' }
export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* valeur mal encodée : ignorée */
    }
  }
  return out;
}

// httpOnly : illisible par le JavaScript de la page. SameSite=Lax : pas envoyé par un autre site.
// Secure en production : seulement en HTTPS.
function cookie(name, path, token, expiresAt) {
  const attrs = [`${name}=${token}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (expiresAt) attrs.push(`Expires=${expiresAt.toUTCString()}`);
  else attrs.push('Max-Age=0');
  if (env.isProd) attrs.push('Secure');
  return attrs.join('; ');
}

export const sessionCookie = (token, expiresAt) => cookie(SESSION_COOKIE, COOKIE_PATH, token, expiresAt);

export const readSessionToken = (req) => parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;

// Lot 4 : jeton de 5 minutes entre le mot de passe et le code du Prestataire. Envoyé seulement à
// l'adresse de connexion : il n'ouvre aucune page.
export const CHALLENGE_COOKIE = 'bc_equipe_code';
const CHALLENGE_PATH = '/api/staff/login';
export const challengeCookie = (token, expiresAt) => cookie(CHALLENGE_COOKIE, CHALLENGE_PATH, token, expiresAt);
export const readChallengeToken = (req) => parseCookies(req.headers.cookie)[CHALLENGE_COOKIE] || null;

const unauthorized = (res) =>
  res.status(401).json({ error: { code: 'NON_CONNECTE', message: "Connectez-vous pour accéder à l'espace équipe." } });
const forbidden = (res) =>
  res.status(403).json({ error: { code: 'ACCES_REFUSE', message: "Votre compte n'a pas accès à cette page." } });
const mustChange = (res) =>
  res.status(403).json({ error: { code: 'MOT_DE_PASSE_A_CHANGER', message: 'Choisissez d’abord votre propre mot de passe.' } });

// 'ok', 'non-connecte', 'refuse' ou 'mot-de-passe' (mot de passe provisoire à changer) :
// qui a droit à une route de l'espace équipe.
// Lot 4 : une route ouverte au Patron l'est aussi au Prestataire (jamais celles du livreur seul).
export function accessFor(user, roles, { allowProvisional = false } = {}) {
  if (!user) return 'non-connecte';
  if (user.mustChangePassword && !allowProvisional) return 'mot-de-passe';
  if (isPrestataire(user) && roles.includes('PATRON')) return 'ok';
  if (roles.length && !roles.includes(user.role)) return 'refuse';
  return 'ok';
}

function guard(roles, options) {
  const middleware = async (req, res, next) => {
    try {
      const user = await getSessionUser(readSessionToken(req));
      const access = accessFor(user, roles, options);
      if (access === 'non-connecte') return unauthorized(res);
      if (access === 'mot-de-passe') return mustChange(res);
      if (access === 'refuse') return forbidden(res);
      req.staff = user;
      next();
    } catch (e) {
      next(e);
    }
  };
  // Lot 5b : lu par test/route-access.test.js, qui vérifie qui a accès à chaque adresse de l'espace équipe
  middleware.staffAccess = { roles, ...options };
  return middleware;
}

// Protège une route de l'espace équipe. Sans rôle : tout compte connecté.
// Avec rôles : requireStaff('PATRON') réserve la route au patron.
// Un compte au mot de passe provisoire n'a accès à rien tant qu'il ne l'a pas changé.
export const requireStaff = (...roles) => guard(roles);

// Seules exceptions au mot de passe provisoire : savoir qui est connecté et changer son mot de passe
export const requireStaffSession = () => guard([], { allowProvisional: true });
