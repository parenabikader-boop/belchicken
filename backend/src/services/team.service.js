// Page Équipe (Patron) et changement de son propre mot de passe (tout membre)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, hashToken, verifyPassword } from './staff-auth.js';
import { teamActionError } from './team.js';

// Ce que la page Équipe montre d'un compte : jamais l'empreinte du mot de passe
const toMember = (u, sessions) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  devices: sessions, // appareils connectés en ce moment
});

export async function listMembers() {
  const [users, sessions] = await Promise.all([
    prisma.staffUser.findMany({ orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }] }),
    prisma.staffSession.groupBy({ by: ['userId'], where: { expiresAt: { gt: new Date() } }, _count: { _all: true } }),
  ]);
  const count = new Map(sessions.map((s) => [s.userId, s._count._all]));
  return users.map((u) => toMember(u, count.get(u.id) || 0));
}

export async function createMember({ name, phone, role, password }) {
  const existing = await prisma.staffUser.findUnique({ where: { phone } });
  if (existing) {
    const message = existing.isActive
      ? `Ce numéro a déjà un compte (${existing.name}).`
      : `Ce numéro a déjà un compte désactivé (${existing.name}) : réactivez-le dans la liste.`;
    throw new AppError(409, message, 'NUMERO_DEJA_UTILISE');
  }
  const user = await prisma.staffUser.create({
    data: { name, phone, role, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  return toMember(user, 0);
}

async function findTarget(actor, id, action) {
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'Compte introuvable.', 'INTROUVABLE');
  const error = teamActionError(actor, target, action);
  if (error) throw new AppError(409, error, 'ACTION_IMPOSSIBLE');
  return target;
}

// Mot de passe oublié : nouveau mot de passe provisoire, à changer à la prochaine connexion.
// Les appareils encore connectés sont déconnectés.
export async function resetPassword(actor, id, password) {
  const target = await findTarget(actor, id, 'reset');
  const [user] = await prisma.$transaction([
    prisma.staffUser.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } }),
    prisma.staffSession.deleteMany({ where: { userId: target.id } }),
  ]);
  return toMember(user, 0);
}

// Agent qui part : plus de connexion, déconnecté de tous ses téléphones, et ses téléphones
// ne reçoivent plus les alertes de nouvelle commande.
export async function deactivate(actor, id) {
  const target = await findTarget(actor, id, 'deactivate');
  const [user] = await prisma.$transaction([
    prisma.staffUser.update({ where: { id: target.id }, data: { isActive: false } }),
    prisma.staffSession.deleteMany({ where: { userId: target.id } }),
    prisma.pushSubscription.deleteMany({ where: { staffUserId: target.id } }),
  ]);
  return toMember(user, 0);
}

// Retour d'un agent (ou désactivation par erreur) : l'ancien mot de passe n'est jamais remis en service
export async function reactivate(actor, id, password) {
  const target = await findTarget(actor, id, 'reactivate');
  const user = await prisma.staffUser.update({
    where: { id: target.id },
    data: { isActive: true, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  return toMember(user, 0);
}

// Changement de son propre mot de passe. Les autres appareils du membre sont déconnectés,
// celui-ci reste connecté. Renvoie le compte à jour.
export async function changeOwnPassword(user, sessionToken, { currentPassword, newPassword }) {
  if (!user.mustChangePassword && !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'Mot de passe actuel incorrect.', 'MOT_DE_PASSE_INCORRECT');
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    const message = user.mustChangePassword
      ? 'Choisissez un mot de passe différent du mot de passe provisoire.'
      : "Choisissez un mot de passe différent de l'ancien.";
    throw new AppError(400, message, 'MEME_MOT_DE_PASSE');
  }
  const [updated] = await prisma.$transaction([
    prisma.staffUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } }),
    prisma.staffSession.deleteMany({ where: { userId: user.id, NOT: { tokenHash: hashToken(sessionToken) } } }),
  ]);
  return updated;
}
