// Lot 5b : équipes de livreurs, disponibilité et comptes de notre équipe de livraison (règles dans courier-team.js)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { getAppSettings } from './app-settings.service.js';
import { logSecurity } from './security-log.service.js';
import { createMember, deactivate, reactivate, resetPassword } from './team.service.js';
import {
  availabilityActive, availabilityError, courierState, deliveryActionError, deliveryCreateError, STATE_LABEL, teamOf, toPartnerCourse,
} from './courier-team.js';

// Réglage du Patron « Tournées et disponibilité » (déjà éteint si le Prestataire l'a fermé)
export const restaurantDispatch = async (db = prisma) => (await getAppSettings(db)).restaurantDispatch;

// La disponibilité compte-t-elle pour l'équipe de ce livreur, ou de cette commande ?
export const isAvailabilityActive = async (team, db = prisma) => availabilityActive(team, team === 'RESTAURANT' && (await restaurantDispatch(db)));

const COURIER_SELECT = {
  id: true, name: true, phone: true, isActive: true, role: true, courierTeam: true, availability: true, availabilityChangedAt: true,
  _count: { select: { courses: { where: { status: 'EN_LIVRAISON' } } } },
};

// Livreurs actifs d'une équipe, avec leur état (null = disponibilité pas active, fonctionnement d'avant)
async function couriersOf(team, active) {
  const rows = await prisma.staffUser.findMany({
    where: { role: 'LIVREUR', isActive: true, courierTeam: team },
    orderBy: { name: 'asc' },
    select: COURIER_SELECT,
  });
  return rows.map(({ _count, ...c }) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    team,
    activeCourses: _count.courses,
    availability: c.availability,
    availabilityChangedAt: c.availabilityChangedAt,
    state: courierState(c, _count.courses, active),
  }));
}

// Livreurs proposés au départ d'une commande : seulement ceux de l'équipe de son mode
// (sans commande : livreurs du restaurant, comme avant). Ceux en pause sont listés mais refusés par le serveur.
export async function listCouriersFor(reference) {
  let team = 'RESTAURANT';
  if (reference) {
    const order = await prisma.order.findUnique({ where: { reference }, select: { deliveryOperator: true } });
    if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
    team = order.deliveryOperator;
  }
  const active = await isAvailabilityActive(team);
  return { team, availabilityActive: active, couriers: await couriersOf(team, active) };
}

// Disponible / En pause. side : 'self' (le livreur), 'restaurant' (Patron, Opérateur), 'livraison' (notre équipe).
// Chaque changement est noté (CourierAvailabilityChange) : preuves pour le relevé du sous-lot 5d.
export async function setAvailability(actor, targetId, to, side) {
  await prisma.$transaction(async (tx) => {
    const target = await tx.staffUser.findUnique({ where: { id: targetId } });
    const active = target ? await isAvailabilityActive(teamOf(target), tx) : false;
    const error = availabilityError({ actor, target, to, active, side });
    if (error) throw new AppError(target ? 400 : 404, error, 'DISPONIBILITE_IMPOSSIBLE');
    const updated = await tx.staffUser.updateMany({
      where: { id: target.id, availability: target.availability },
      data: { availability: to, availabilityChangedAt: new Date() },
    });
    if (updated.count !== 1) throw new AppError(409, 'La disponibilité vient de changer. La page est mise à jour.', 'DISPONIBILITE_CHANGEE');
    await tx.courierAvailabilityChange.create({
      data: { courierId: target.id, courierName: target.name, team: teamOf(target), from: target.availability, to, byName: actor.name },
    });
  });
}

// Page Courses : la disponibilité du livreur connecté (active = boutons affichés)
export async function myAvailability(courier) {
  const me = await prisma.staffUser.findUnique({ where: { id: courier.id }, select: COURIER_SELECT });
  const team = teamOf(me);
  const active = await isAvailabilityActive(team);
  return { team, active, availability: me.availability, state: courierState(me, me._count.courses, active), stateLabel: STATE_LABEL[courierState(me, me._count.courses, active)] || null };
}

// ─── Page Livraison (Responsable livraison et Prestataire) ───

// Nos livreurs et leur état, nos courses en cours (frais de livraison seulement, jamais les ventes)
export async function getDeliveryOverview(now = new Date()) {
  const [couriers, courses] = await Promise.all([
    couriersOf('PRESTATAIRE', true),
    prisma.order.findMany({
      where: { deliveryOperator: 'PRESTATAIRE', status: 'EN_LIVRAISON' },
      orderBy: { courierAssignedAt: 'asc' },
      select: { reference: true, status: true, deliveryZoneName: true, courierId: true, courierName: true, courierAssignedAt: true, deliveryFee: true, deliveryNightFee: true },
    }),
  ]);
  return { couriers, courses: courses.map(toPartnerCourse), serverTime: now };
}

// Comptes de notre équipe : nos livreurs (et, pour le Prestataire, les Responsables livraison)
export async function listDeliveryTeam(actor) {
  const roles = actor.role === 'PRESTATAIRE' ? ['LIVREUR', 'RESPONSABLE_LIVRAISON'] : ['LIVREUR'];
  const [users, sessions] = await Promise.all([
    prisma.staffUser.findMany({
      where: { role: { in: roles }, OR: [{ role: 'RESPONSABLE_LIVRAISON' }, { courierTeam: 'PRESTATAIRE' }] },
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    }),
    prisma.staffSession.groupBy({ by: ['userId'], where: { expiresAt: { gt: new Date() } }, _count: { _all: true } }),
  ]);
  const count = new Map(sessions.map((s) => [s.userId, s._count._all]));
  return users.map((u) => ({
    id: u.id, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, devices: count.get(u.id) || 0,
  }));
}

const ROLE_WORD = { LIVREUR: 'livreur', RESPONSABLE_LIVRAISON: 'Responsable livraison' };
const accountLog = (actor, meta, detail) => logSecurity({ type: 'COMPTE_LIVRAISON', actor, detail, meta });

export async function createDeliveryMember(actor, input, meta) {
  const error = deliveryCreateError(actor, input.role);
  if (error) throw new AppError(403, error, 'ACTION_IMPOSSIBLE');
  const member = await createMember(input, 'PRESTATAIRE');
  await accountLog(actor, meta, `Compte créé (${ROLE_WORD[input.role]}) : ${member.name} (${member.phone})`);
  return member;
}

// Mot de passe provisoire, désactivation, réactivation (deliveryActionError)
const ACTIONS = {
  reset: { run: (actor, id, password) => resetPassword(actor, id, password, deliveryActionError), word: 'Mot de passe provisoire donné' },
  deactivate: { run: (actor, id) => deactivate(actor, id, deliveryActionError), word: 'Compte désactivé' },
  reactivate: { run: (actor, id, password) => reactivate(actor, id, password, deliveryActionError), word: 'Compte réactivé, avec un mot de passe provisoire' },
};

export async function deliveryMemberAction(actor, id, action, password, meta) {
  const member = await ACTIONS[action].run(actor, id, password);
  await accountLog(actor, meta, `${ACTIONS[action].word} (${ROLE_WORD[member.role] || member.role}) : ${member.name} (${member.phone})`);
  return member;
}
