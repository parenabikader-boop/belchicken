// Page Équipe (Patron) et changement de son propre mot de passe (tout membre)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, hashToken, verifyPassword } from './staff-auth.js';
import { teamActionError } from './team.js';
import { isDeliveryTeamAccount } from './courier-team.js';

// Ce que la page Équipe montre d'un compte : jamais l'empreinte du mot de passe
const toMember = (u, sessions) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role,
  courierTeam: u.role === 'LIVREUR' ? u.courierTeam : null, // lot 5b : livreur du restaurant ou de notre équipe
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  devices: sessions, // appareils connectés en ce moment
});

// Lot 4 : le Patron voit qu'un compte Prestataire existe (transparence), sans son numéro, ses connexions
// ni aucune action possible
const toPrestataireLine = (u) => ({ id: u.id, name: u.name, role: u.role, isActive: u.isActive });
// Lot 5b : notre équipe de livraison, visible par le Patron sans numéro ni action (gérée par le Prestataire)
const toDeliveryLine = (u) => ({ ...toPrestataireLine(u), courierTeam: u.role === 'LIVREUR' ? u.courierTeam : null, deliveryTeam: true });

export async function listMembers() {
  const [users, sessions] = await Promise.all([
    prisma.staffUser.findMany({ orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }] }),
    prisma.staffSession.groupBy({ by: ['userId'], where: { expiresAt: { gt: new Date() } }, _count: { _all: true } }),
  ]);
  const count = new Map(sessions.map((s) => [s.userId, s._count._all]));
  return users.map((u) => {
    if (u.role === 'PRESTATAIRE') return toPrestataireLine(u);
    if (isDeliveryTeamAccount(u)) return toDeliveryLine(u);
    return toMember(u, count.get(u.id) || 0);
  });
}

// courierTeam (lot 5b) : PRESTATAIRE pour nos livreurs, créés depuis la page Livraison ou Prestataire
export async function createMember({ name, phone, role, password }, courierTeam = 'RESTAURANT') {
  const existing = await prisma.staffUser.findUnique({ where: { phone } });
  if (existing) {
    const message = existing.isActive
      ? `Ce numéro a déjà un compte (${existing.name}).`
      : `Ce numéro a déjà un compte désactivé (${existing.name}) : réactivez-le dans la liste.`;
    throw new AppError(409, message, 'NUMERO_DEJA_UTILISE');
  }
  const user = await prisma.staffUser.create({
    data: { name, phone, role, courierTeam, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  return toMember(user, 0);
}

// check : règles de la page (teamActionError pour le Patron, deliveryActionError pour notre équipe, lot 5b)
async function findTarget(actor, id, action, check) {
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'Compte introuvable.', 'INTROUVABLE');
  const error = check(actor, target, action);
  if (error) throw new AppError(409, error, 'ACTION_IMPOSSIBLE');
  return target;
}

// Mot de passe oublié : nouveau mot de passe provisoire, à changer à la prochaine connexion.
// Les appareils encore connectés sont déconnectés.
export async function resetPassword(actor, id, password, check = teamActionError) {
  const target = await findTarget(actor, id, 'reset', check);
  const [user] = await prisma.$transaction([
    prisma.staffUser.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } }),
    prisma.staffSession.deleteMany({ where: { userId: target.id } }),
  ]);
  return toMember(user, 0);
}

// Agent qui part : plus de connexion, déconnecté de tous ses téléphones, et ses téléphones
// ne reçoivent plus les alertes de nouvelle commande.
export async function deactivate(actor, id, check = teamActionError) {
  const target = await findTarget(actor, id, 'deactivate', check);
  const [user] = await prisma.$transaction([
    prisma.staffUser.update({ where: { id: target.id }, data: { isActive: false } }),
    prisma.staffSession.deleteMany({ where: { userId: target.id } }),
    prisma.pushSubscription.deleteMany({ where: { staffUserId: target.id } }),
  ]);
  return toMember(user, 0);
}

// Retour d'un agent (ou désactivation par erreur) : l'ancien mot de passe n'est jamais remis en service
export async function reactivate(actor, id, password, check = teamActionError) {
  const target = await findTarget(actor, id, 'reactivate', check);
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
