// Espace livreur : règles sans base de données (testées dans test/courier.test.js).
// Les accès à la base sont dans courier.service.js et staff-orders.service.js.
//
// - L'agent assigne un livreur au passage EN_LIVRAISON ; un code de remise à 4 chiffres est créé
//   et ajouté au message « en route » envoyé au client.
// - Le livreur tape le code donné par le client pour passer la commande à LIVREE. Il ne reçoit
//   jamais le code : l'API le vérifie. Après 5 codes faux, la saisie est bloquée sur cette commande.
// - Client sans son code : l'agent valide à sa place, avec un motif noté dans l'historique.
import { randomInt, timingSafeEqual } from 'node:crypto';

export const MAX_CODE_ATTEMPTS = 5;
export const CODE_LENGTH = 4;

// « 0427 » : de 0000 à 9999, tiré au hasard (générateur cryptographique)
export const generateDeliveryCode = () => String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

// « 48 27 », « 4827 » ou « 4 8 2 7 » -> « 4827 »
export const cleanCode = (code) => String(code ?? '').replace(/\D/g, '');

export const codeLocked = (order) => order.deliveryCodeAttempts >= MAX_CODE_ATTEMPTS;
export const attemptsLeft = (order) => Math.max(0, MAX_CODE_ATTEMPTS - order.deliveryCodeAttempts);

// Choix du livreur : au passage EN_LIVRAISON (depuis EN_PREPARATION), ou remplacement pendant la livraison.
// Renvoie null si permis, sinon le message.
export function courierAssignError(order, courier) {
  if (!['EN_PREPARATION', 'EN_LIVRAISON'].includes(order.status)) return 'Le livreur se choisit au départ de la commande.';
  if (!courier) return 'Choisissez le livreur.';
  if (courier.role !== 'LIVREUR') return 'Ce compte n’est pas un compte livreur.';
  if (!courier.isActive) return `Le compte de ${courier.name} est désactivé.`;
  if (order.status === 'EN_LIVRAISON' && order.courierId === courier.id) return `${courier.name} a déjà cette course.`;
  return null;
}

// Le livreur tape le code donné par le client.
//   { ok: true }                 bon code : la commande passe à LIVREE ;
//   { ok: false, error, wrong }  refusé ; wrong = code faux (compté), sinon refus sans essai compté.
export function checkHandover(order, courierId, code) {
  if (!order || order.courierId !== courierId) return { ok: false, error: 'Cette course ne vous est pas assignée.' };
  if (order.status === 'LIVREE') return { ok: false, error: 'Cette commande est déjà livrée.' };
  if (order.status === 'ANNULEE') return { ok: false, error: 'Cette commande a été annulée : ne la livrez pas. Appelez l’équipe.' };
  if (order.status !== 'EN_LIVRAISON') return { ok: false, error: 'Cette commande n’est pas en livraison.' };
  if (!order.deliveryCode) return { ok: false, error: 'Cette commande n’a pas de code. Appelez l’équipe pour valider la livraison.' };
  if (codeLocked(order)) return { ok: false, error: 'Trop de codes faux. Appelez l’équipe : elle validera la livraison.' };
  const typed = cleanCode(code);
  if (typed.length !== CODE_LENGTH) return { ok: false, error: `Le code a ${CODE_LENGTH} chiffres.` };
  if (!timingSafeEqual(Buffer.from(typed), Buffer.from(order.deliveryCode))) {
    const left = attemptsLeft(order) - 1;
    const error = left > 0
      ? `Code incorrect. Encore ${left} essai${left > 1 ? 's' : ''}.`
      : 'Code incorrect. Trop de codes faux : appelez l’équipe, elle validera la livraison.';
    return { ok: false, wrong: true, error };
  }
  return { ok: true };
}

// Livraison validée par l'agent (client sans son code) : motif obligatoire
export function handoverReasonError(reason) {
  if (!reason || reason.trim().length < 3) return 'Indiquez pourquoi la livraison est validée sans code.';
  return null;
}

// Début du jour (minuit, heure du Burkina = UTC)
export const startOfToday = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

// Lien Google Maps : itinéraire jusqu'à la position du client
export const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// Ce que le livreur voit d'une course : jamais de montant, de code, de paiement ni d'historique
export function toCourse(o) {
  const deliveredAt = o.statusChanges?.findLast((h) => h.toStatus === 'LIVREE')?.createdAt || null;
  return {
    reference: o.reference,
    status: o.status,
    assignedAt: o.courierAssignedAt,
    deliveredAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    addressNote: o.addressNote,
    location: o.latitude != null ? { latitude: o.latitude, longitude: o.longitude, accuracy: o.locationAccuracy } : null,
    directionsUrl: o.latitude != null ? directionsUrl(o.latitude, o.longitude) : null,
    items: o.items.map((i) => ({
      productName: i.productName,
      productNumber: i.productNumber,
      variantLabel: i.variantLabel,
      choice: i.choice,
      note: i.note,
      quantity: i.quantity,
    })),
    hasCode: Boolean(o.deliveryCode),
    attemptsLeft: attemptsLeft(o),
    locked: o.status === 'EN_LIVRAISON' && codeLocked(o),
  };
}

// Tableau de bord : livraisons par livreur et temps moyen (départ EN_LIVRAISON -> remise LIVREE).
// orders : commandes livrées, avec courierId, courierName, startedAt et deliveredAt, withoutCode.
export function courierStats(orders) {
  const map = new Map();
  for (const o of orders) {
    if (o.status !== 'LIVREE' || !o.courierName) continue;
    const key = o.courierId || `nom:${o.courierName}`;
    const cur = map.get(key) || { name: o.courierName, delivered: 0, withoutCode: 0, timed: 0, totalMinutes: 0 };
    cur.delivered += 1;
    if (o.withoutCode) cur.withoutCode += 1;
    if (o.startedAt && o.deliveredAt && o.deliveredAt > o.startedAt) {
      cur.timed += 1;
      cur.totalMinutes += (o.deliveredAt - o.startedAt) / 60000;
    }
    map.set(key, cur);
  }
  return [...map.values()]
    .map(({ timed, totalMinutes, ...c }) => ({ ...c, avgMinutes: timed ? Math.round(totalMinutes / timed) : null }))
    .sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name, 'fr'));
}
