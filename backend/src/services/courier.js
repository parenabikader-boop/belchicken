// Espace livreur : règles sans base de données (testées dans test/courier.test.js).
// Les accès à la base sont dans courier.service.js et staff-orders.service.js.
//
// - L'agent assigne un livreur au passage EN_LIVRAISON ; un code de remise à 4 chiffres est créé
//   et ajouté au message « en route » envoyé au client.
// - Le livreur encaisse les frais de livraison à la réception (espèces ou mobile money au numéro
//   marchand) et note comment ils ont été payés en validant la remise.
// - Le livreur tape le code donné par le client pour passer la commande à LIVREE. Il ne reçoit
//   jamais le code : l'API le vérifie. Après 5 codes faux, la saisie est bloquée sur cette commande.
// - Client sans son code : l'agent valide à sa place, avec un motif noté dans l'historique.
// - À emporter : même code (mêmes colonnes deliveryCode / deliveryCodeAttempts), créé au passage PRETE
//   et envoyé dans le message « commande prête ». L'agent le tape au comptoir (checkPickupCode).
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
  return checkCode(order, code, {
    noCode: 'Cette commande n’a pas de code. Appelez l’équipe pour valider la livraison.',
    locked: 'Trop de codes faux. Appelez l’équipe : elle validera la livraison.',
    lastWrong: 'Code incorrect. Trop de codes faux : appelez l’équipe, elle validera la livraison.',
  });
}

// Vérification du code, la même pour le livreur et pour le comptoir (à emporter) ; texts : les
// messages propres à chacun (pas de code, saisie bloquée, dernier code faux).
function checkCode(order, code, texts) {
  if (!order.deliveryCode) return { ok: false, error: texts.noCode };
  if (codeLocked(order)) return { ok: false, error: texts.locked };
  const typed = cleanCode(code);
  if (typed.length !== CODE_LENGTH) return { ok: false, error: `Le code a ${CODE_LENGTH} chiffres.` };
  if (!timingSafeEqual(Buffer.from(typed), Buffer.from(order.deliveryCode))) {
    const left = attemptsLeft(order) - 1;
    const error = left > 0 ? `Code incorrect. Encore ${left} essai${left > 1 ? 's' : ''}.` : texts.lastWrong;
    return { ok: false, wrong: true, error };
  }
  return { ok: true };
}

// À emporter : l'agent tape au comptoir le code de retrait donné par le client (créé au passage PRETE,
// envoyé dans le message « commande prête »). Même réponse que checkHandover. 5 codes faux au plus ;
// ensuite, ou si le client n'a plus son code, l'agent valide sans code avec un motif (RETRAIT_SANS_CODE).
export function checkPickupCode(order, code) {
  if (order.mode !== 'A_EMPORTER') return { ok: false, error: 'Cette commande est en livraison : c’est le livreur qui tape le code.' };
  if (order.status !== 'PRETE') return { ok: false, error: 'Cette commande n’est pas prête à retirer.' };
  return checkCode(order, code, {
    noCode: 'Cette commande n’a pas de code de retrait : validez la remise sans code, avec un motif.',
    locked: 'Trop de codes faux : si c’est bien le client, validez la remise sans code, avec un motif.',
    lastWrong: 'Code incorrect. Trop de codes faux : si c’est bien le client, validez la remise sans code, avec un motif.',
  });
}

// Livraison (ou retrait au comptoir) validée par l'agent, client sans son code : motif obligatoire
export function handoverReasonError(reason, pickup = false) {
  if (!reason || reason.trim().length < 3) return `Indiquez pourquoi ${pickup ? 'la remise au comptoir' : 'la livraison'} est validée sans code.`;
  return null;
}

// Début du jour (minuit, heure du Burkina = UTC)
export const startOfToday = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

// Lien Google Maps : itinéraire jusqu'à la position du client
export const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// Ce que le livreur voit d'une course : les frais de livraison qu'il encaisse, et c'est tout.
// Jamais le total des plats, le code, le paiement des plats ni l'historique.
export function toCourse(o) {
  const deliveredAt = o.statusChanges?.findLast((h) => h.toStatus === 'LIVREE')?.createdAt || null;
  return {
    reference: o.reference,
    status: o.status,
    assignedAt: o.courierAssignedAt,
    deliveredAt,
    // Frais à encaisser à la réception ; feePaidBefore : anciennes commandes, frais déjà payés avant le départ
    deliveryFee: o.deliveryFee,
    deliveryNightFee: o.deliveryNightFee ?? null, // lot 3 : dont supplément de nuit (compris dans deliveryFee)
    deliveryZoneName: o.deliveryZoneName, // quartier choisi par le client (grille des frais)
    feePaidBefore: o.status === 'EN_LIVRAISON' && o.deliveryFeeMethod != null,
    feeMethod: o.status === 'LIVREE' ? o.deliveryFeeMethod : null,
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
      // Boissons choisies (pour une formule) : le livreur vérifie le sac
      drinks: (i.drinks || []).map((d) => ({ name: d.name, quantity: d.quantity })),
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
