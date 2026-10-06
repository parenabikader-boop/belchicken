// Caisse : frais de livraison payés au livreur à la réception (règles sans base de données,
// testées dans test/cash.test.js). Accès à la base dans cash.service.js.
//
// - Mobile money (code marchand) : l'équipe le vérifie sur le téléphone marchand (« Frais à vérifier »).
// - Espèces : le livreur les garde jusqu'à ce qu'il les remette au restaurant. « Espèces remises »
//   regroupe toutes les courses payées en espèces qu'il avait encore sur lui (CashRemittance).

// Début du jour (minuit, heure du Burkina = UTC)
const startOfDay = (now) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

// Espèces encore chez les livreurs, par livreur.
// orders : commandes livrées payées en espèces, pas encore remises (courierId, courierName, deliveryFee, deliveredAt).
// couriers : comptes livreurs actifs, affichés même sans espèces (le Patron voit tout le monde).
export function cashByCourier(orders, couriers = [], now = new Date()) {
  const today = startOfDay(now);
  const map = new Map(couriers.map((c) => [c.id, { courierId: c.id, courierName: c.name, amount: 0, today: 0, orders: [] }]));
  for (const o of orders) {
    const key = o.courierId || `nom:${o.courierName}`;
    const cur = map.get(key) || { courierId: o.courierId, courierName: o.courierName || 'Livreur inconnu', amount: 0, today: 0, orders: [] };
    cur.amount += o.deliveryFee;
    if (o.deliveredAt && new Date(o.deliveredAt).getTime() >= today) cur.today += o.deliveryFee;
    cur.orders.push({ reference: o.reference, customerName: o.customerName, deliveryFee: o.deliveryFee, deliveredAt: o.deliveredAt });
    map.set(key, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, older: c.amount - c.today, orders: c.orders.sort((a, b) => new Date(a.deliveredAt) - new Date(b.deliveredAt)) }))
    .sort((a, b) => b.amount - a.amount || a.courierName.localeCompare(b.courierName, 'fr'));
}

// « Espèces remises » : l'agent confirme les courses qu'il voyait à l'écran (references).
// orders : ces commandes lues en base. Renvoie null si permis, sinon le message.
export function remitError(orders, courierId, references) {
  if (!courierId) return 'Choisissez le livreur.';
  if (!references?.length) return 'Ce livreur n’a pas d’espèces à remettre.';
  if (orders.length !== new Set(references).size) return 'Une course a changé. La page est mise à jour.';
  for (const o of orders) {
    if (o.courierId !== courierId) return `La commande ${o.reference} n’a pas été livrée par ce livreur.`;
    if (o.status !== 'LIVREE' || o.deliveryFeeMethod !== 'ESPECES') return `La commande ${o.reference} n’a pas été payée en espèces.`;
    if (o.cashRemittanceId) return `Les espèces de la commande ${o.reference} sont déjà remises. La page est mise à jour.`;
  }
  return null;
}

export const remitTotal = (orders) => orders.reduce((s, o) => s + o.deliveryFee, 0);
