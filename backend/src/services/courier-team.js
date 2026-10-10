// Lot 5b : livreurs du restaurant ou de notre équipe, et leur disponibilité (règles sans base de données,
// testées dans test/courier-team.test.js). Les accès à la base sont dans courier-team.service.js.
//
// - Chaque livreur appartient à une équipe (StaffUser.courierTeam) : RESTAURANT (tous les livreurs d'avant le
//   lot 5b, créés par le Patron) ou PRESTATAIRE (notre équipe, créée par le Prestataire ou le Responsable livraison).
// - Une commande ne part qu'avec un livreur de son mode (Order.deliveryOperator, figé à la création).
// - Disponibilité : Disponible ou En pause, choisie par le livreur (page Courses) ou par l'équipe. « En course »
//   est calculé : au moins une commande EN_LIVRAISON. Un livreur en pause est refusé par le serveur.
// - Notre équipe : disponibilité toujours active. Livreurs du restaurant : seulement avec le réglage du Patron
//   « Tournées et disponibilité » (AppSettings.restaurantDispatch, inclus par le Prestataire : TOURNEES_RESTAURANT).
//   Éteint : fonctionnement d'avant, aucun bouton, tous les livreurs proposés.
// - Responsable livraison : gère nos livreurs et notre caisse, ne voit JAMAIS les ventes de Belchicken.
export const AVAILABILITIES = ['DISPONIBLE', 'EN_PAUSE'];
export const STATE_LABEL = { DISPONIBLE: 'Disponible', EN_PAUSE: 'En pause', EN_COURSE: 'En course' };
export const TEAM_LABEL = { RESTAURANT: 'Restaurant', PRESTATAIRE: 'Notre équipe' };

export const teamOf = (courier) => courier?.courierTeam || 'RESTAURANT';
export const orderTeam = (order) => order?.deliveryOperator || 'RESTAURANT';

// La disponibilité compte-t-elle pour cette équipe ? (dispatch : réglage du Patron, déjà combiné à l'interrupteur)
export const availabilityActive = (team, dispatch) => team === 'PRESTATAIRE' || Boolean(dispatch);

// État affiché d'un livreur : En course (calculé) passe avant Disponible ; En pause reste visible.
// null quand la disponibilité n'est pas active pour son équipe (fonctionnement d'avant).
export function courierState(courier, activeCourses, active) {
  if (!active) return null;
  if (courier.availability === 'EN_PAUSE') return 'EN_PAUSE';
  return activeCourses > 0 ? 'EN_COURSE' : 'DISPONIBLE';
}

// Livreur choisi pour une commande : de la bonne équipe, et pas en pause si la disponibilité est active.
// Renvoie null si permis, sinon le message.
export function courierTeamError(order, courier, active) {
  const team = orderTeam(order);
  if (teamOf(courier) !== team) {
    return team === 'PRESTATAIRE'
      ? 'Cette commande est livrée par notre partenaire : choisissez un livreur de son équipe.'
      : 'Cette commande est livrée par le restaurant : choisissez un livreur du restaurant.';
  }
  if (active && courier.availability === 'EN_PAUSE') return `${courier.name} est en pause : choisissez un livreur disponible.`;
  return null;
}

// Qui peut changer la disponibilité de qui. actor : compte connecté ; target : le livreur.
//   - le livreur lui-même ;
//   - Patron, Prestataire et Opérateur : les livreurs du restaurant (route des commandes) ;
//   - Responsable livraison et Prestataire : nos livreurs (route Livraison).
// side : 'restaurant' (route des commandes), 'livraison' (route Livraison) ou 'self' (page Courses).
export function availabilityError({ actor, target, to, active, side }) {
  if (!target || target.role !== 'LIVREUR') return 'Livreur introuvable.';
  if (!target.isActive) return `Le compte de ${target.name} est désactivé.`;
  if (!AVAILABILITIES.includes(to)) return 'Choisissez Disponible ou En pause.';
  const team = teamOf(target);
  if (side === 'self' && actor.id !== target.id) return 'Vous ne pouvez changer que votre propre disponibilité.';
  if (side === 'restaurant' && team !== 'RESTAURANT') return 'Ce livreur fait partie de l’équipe de notre partenaire : c’est son responsable qui gère sa disponibilité.';
  if (side === 'livraison' && team !== 'PRESTATAIRE') return 'Ce livreur fait partie du restaurant.';
  if (!active) return 'La disponibilité des livreurs du restaurant n’est pas activée (réglage du Patron).';
  if ((target.availability || 'DISPONIBLE') === to) return `${target.name} est déjà ${to === 'EN_PAUSE' ? 'en pause' : 'disponible'}.`;
  return null;
}

// ─── Comptes de notre équipe de livraison ───
// Le Prestataire crée les Responsables livraison et nos livreurs ; le Responsable livraison crée, désactive,
// réactive nos livreurs et leur donne un mot de passe provisoire, jamais d'autres responsables.
export const DELIVERY_ROLES = ['LIVREUR', 'RESPONSABLE_LIVRAISON'];

// Rôle demandé à la création. Renvoie null si permis, sinon le message.
export function deliveryCreateError(actor, role) {
  if (!DELIVERY_ROLES.includes(role)) return 'Choisissez le rôle : Livreur ou Responsable livraison.';
  if (role === 'RESPONSABLE_LIVRAISON' && actor.role !== 'PRESTATAIRE') return 'Seul le Prestataire crée un compte Responsable livraison.';
  return null;
}

// Fait partie de notre équipe de livraison (et se gère depuis la page Livraison ou Prestataire)
export const isDeliveryTeamAccount = (u) => u.role === 'RESPONSABLE_LIVRAISON' || (u.role === 'LIVREUR' && teamOf(u) === 'PRESTATAIRE');

// Action sur un compte de notre équipe : 'reset' (mot de passe provisoire), 'deactivate', 'reactivate'
export function deliveryActionError(actor, target, action) {
  if (target.id === actor.id) return 'Pour votre propre compte, utilisez « Mon mot de passe ».';
  if (!isDeliveryTeamAccount(target)) return 'Ce compte ne fait pas partie de notre équipe de livraison.';
  if (target.role === 'RESPONSABLE_LIVRAISON' && actor.role !== 'PRESTATAIRE') return 'Seul le Prestataire gère les comptes Responsable livraison.';
  if (action === 'reactivate') return target.isActive ? 'Ce compte est déjà actif.' : null;
  if (!target.isActive) return 'Ce compte est désactivé. Réactivez-le en lui donnant un mot de passe provisoire.';
  return null;
}

// Ce que le Responsable livraison voit d'une course de notre équipe : référence, quartier, livreur, frais
// de livraison. Jamais les plats, le total, le paiement des plats ni le code de remise.
export function toPartnerCourse(o) {
  return {
    reference: o.reference,
    status: o.status,
    deliveryZoneName: o.deliveryZoneName ?? null,
    courierId: o.courierId ?? null,
    courierName: o.courierName ?? null,
    assignedAt: o.courierAssignedAt ?? null,
    deliveryFee: o.deliveryFee ?? null,
    deliveryNightFee: o.deliveryNightFee ?? null,
  };
}
