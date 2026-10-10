import { prisma } from '../lib/prisma.js';
import { hashToken, newSessionToken, verifyAgainstDummy, verifyPassword } from './staff-auth.js';
import { passwordStep } from './prestataire.service.js';

// Durée d'une connexion : l'équipe reste connectée 14 jours sur son téléphone
export const SESSION_DAYS = 14;
// lastSeenAt n'est mis à jour qu'au plus toutes les 5 minutes, pour ne pas écrire en base à chaque requête
const SEEN_REFRESH_MS = 5 * 60 * 1000;

// Ce que l'API renvoie d'un compte : jamais l'empreinte du mot de passe
// mustChangePassword : mot de passe provisoire, l'écran demande d'en choisir un avant tout le reste
export const toPublicStaff = (u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, mustChangePassword: u.mustChangePassword });

// Renvoie { user, token, expiresAt } ou null si le numéro ou le mot de passe est faux.
// Lot 4, compte Prestataire : jamais de session ici, mais { challenge, expiresAt } (le code à 6 chiffres
// est demandé ensuite, prestataire.service.js) ou { locked: true }.
export async function login(phone, password, meta = {}) {
  const user = await prisma.staffUser.findUnique({ where: { phone } });
  if (!user || !user.isActive) {
    await verifyAgainstDummy(password);
    return null;
  }
  if (user.role === 'PRESTATAIRE') return passwordStep(user, password, meta);
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.staffSession.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt, userAgent: meta.userAgent || null },
    }),
    prisma.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    // Ménage : sessions expirées de ce compte
    prisma.staffSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
  ]);
  return { user, token, expiresAt };
}

// Compte connecté pour ce jeton, ou null (jeton inconnu, expiré, compte désactivé)
export async function getSessionUser(token) {
  if (!token) return null;
  const session = await prisma.staffSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  if (Date.now() - session.lastSeenAt.getTime() > SEEN_REFRESH_MS) {
    await prisma.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session.user;
}

export async function logout(token) {
  if (!token) return;
  await prisma.staffSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
