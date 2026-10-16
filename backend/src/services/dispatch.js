// Lot 5c : « Prête pour livraison », « Commande récupérée », tournées et preuves horaires (règles sans base
// de données, testées dans test/dispatch.test.js). Les accès à la base sont dans dispatch.service.js.
//
// Mode Prestataire (Order.deliveryOperator = PRESTATAIRE, livraison) :
//   EN_PREPARATION -> PRETE_LIVRAISON (l'équipe du restaurant : le sac est prêt)
//                  -> EN_LIVRAISON (« Commande récupérée » : le livreur, ou l'agent / le Responsable livraison
//                     à sa place avec un motif ; le code de remise est créé à ce moment)
//                  -> LIVREE (code du client, comme avant).
//   Le Responsable livraison choisit le livreur dès EN_PREPARATION, seul ou en tournée (plusieurs commandes),
//   le change ou le retire jusqu'à la récupération, puis le remplace pendant la livraison. Le Patron et
//   l'Opérateur ne choisissent plus le livreur d'une commande Prestataire.
//   Le message « en route » reste envoyé par le call center, après la récupération.
// Mode Restaurant : comme avant ; avec le réglage « Tournées et disponibilité », l'agent peut faire partir
//   plusieurs commandes « En préparation » avec un même livreur (chacune son code, ses frais, son message).
import { isPartnerDelivery } from './order-status.js';

export const RUN_MAX = 10; // commandes au plus dans une tournée
export const ASSIGNABLE = ['EN_PREPARATION', 'PRETE_LIVRAISON']; // le Responsable choisit le livreur (avant la récupération)

export const PARTNER_ONLY =
  'Commande livrée par notre partenaire : c’est son responsable livraison qui choisit le livreur, et le livreur qui confirme la récupération.';

const hasReason = (reason) => Boolean(reason && reason.trim().length >= 3);

// Le Responsable livraison confie une commande à un livreur (seule ou dans une tournée). null si permis.
export function partnerAssignError(order, courierId) {
  if (!isPartnerDelivery(order)) return `La commande ${order.reference} est livrée par le restaurant.`;
  if (!ASSIGNABLE.includes(order.status)) {
    return order.status === 'EN_LIVRAISON'
      ? `La commande ${order.reference} est déjà récupérée : remplacez son livreur depuis « En livraison ».`
      : `La commande ${order.reference} n’attend pas de livreur.`;
  }
  if (order.courierId && order.courierId === courierId) return `La commande ${order.reference} est déjà confiée à ce livreur.`;
  return null;
}

// Retirer le livreur avant la récupération. null si permis.
export function partnerUnassignError(order) {
  if (!isPartnerDelivery(order)) return 'Cette commande est livrée par le restaurant.';
  if (!ASSIGNABLE.includes(order.status)) return 'Le livreur ne se retire qu’avant la récupération de la commande.';
  if (!order.courierId) return 'Aucun livreur n’a cette commande.';
  return null;
}

// « Commande récupérée ». byCourier : le livreur lui-même (actorId = son compte) ; sinon l'agent ou le
// Responsable livraison, avec un motif. null si permis.
export function pickupError(order, { byCourier, actorId, reason }) {
  if (!isPartnerDelivery(order)) return 'Cette commande est livrée par le restaurant : pas d’étape « récupérée ».';
  if (order.status === 'EN_PREPARATION') return 'La commande n’est pas encore prête : attendez « Prête pour livraison ».';
  if (order.status === 'EN_LIVRAISON') return 'Cette commande est déjà récupérée.';
  if (order.status !== 'PRETE_LIVRAISON') return 'Cette commande n’attend pas d’être récupérée.';
  if (!order.courierId) return 'Aucun livreur n’a cette commande : le responsable livraison doit d’abord en choisir un.';
  if (order.deliveryFee == null) return 'Les frais de livraison ne sont pas saisis.';
  if (byCourier) return order.courierId === actorId ? null : 'Cette course ne vous est pas confiée.';
  return hasReason(reason) ? null : 'Indiquez pourquoi la récupération est confirmée à la place du livreur.';
}

// Tournée en mode Restaurant (réglage « Tournées et disponibilité ») : chaque commande part comme un départ
// habituel. orders : commandes lues en base ; seen : { reference: statut vu à l'écran }. null si permis.
export function restaurantTourError({ dispatch, orders, seen, references }) {
  if (!dispatch) return 'Les tournées des livreurs du restaurant ne sont pas activées (réglage du Patron).';
  if (!references.length) return 'Cochez au moins une commande.';
  if (references.length > RUN_MAX) return `Une tournée compte au plus ${RUN_MAX} commandes.`;
  if (new Set(references).size !== references.length) return 'Une commande est cochée deux fois.';
  if (orders.length !== references.length) return 'Une commande est introuvable. La page est mise à jour.';
  for (const o of orders) {
    if (o.mode === 'A_EMPORTER') return `La commande ${o.reference} est à récupérer.`;
    if (isPartnerDelivery(o)) return `La commande ${o.reference} est livrée par notre partenaire.`;
    if (seen[o.reference] && seen[o.reference] !== o.status) return `Quelqu’un a déjà changé la commande ${o.reference}. La page est mise à jour.`;
    if (o.status !== 'EN_PREPARATION') return `La commande ${o.reference} n’est pas en préparation.`;
  }
  return null;
}

export function partnerRunError({ orders, references, courierId }) {
  if (!courierId) return 'Choisissez le livreur.';
  if (!references.length) return 'Cochez au moins une commande.';
  if (references.length > RUN_MAX) return `Une tournée compte au plus ${RUN_MAX} commandes.`;
  if (new Set(references).size !== references.length) return 'Une commande est cochée deux fois.';
  if (orders.length !== references.length) return 'Une commande est introuvable. La page est mise à jour.';
  for (const o of orders) {
    const error = partnerAssignError(o, courierId);
    if (error) return error;
  }
  return null;
}

// ─── Preuves : l'heure de chaque étape de la livraison ───
// statusChanges et events de la commande (createdAt). Renvoie les heures et les durées en minutes.
const at = (list, test) => list.findLast(test)?.createdAt || null;
const minutes = (from, to) => (from && to && new Date(to) > new Date(from) ? Math.round((new Date(to) - new Date(from)) / 60000) : null);

export function deliveryProofs(order) {
  const changes = order.statusChanges || [];
  const events = order.events || [];
  const pickup = changes.findLast((c) => c.toStatus === 'EN_LIVRAISON') || null;
  const proofs = {
    preparedAt: at(changes, (c) => c.toStatus === 'EN_PREPARATION'),
    readyAt: at(changes, (c) => c.toStatus === 'PRETE_LIVRAISON'),
    assignedAt: at(events, (e) => e.type === 'LIVREUR_ASSIGNE'),
    pickedUpAt: pickup?.createdAt || null,
    pickedUpBy: pickup?.staffName || null,
    pickedUpReason: pickup?.reason || null, // récupérée sans le livreur : le motif
    deliveredAt: at(changes, (c) => c.toStatus === 'LIVREE'),
  };
  return {
    ...proofs,
    waitMinutes: minutes(proofs.readyAt, proofs.pickedUpAt), // le sac prêt attend le livreur
    rideMinutes: minutes(proofs.pickedUpAt, proofs.deliveredAt), // trajet jusqu'au client
  };
}
