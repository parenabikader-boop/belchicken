import { drinksText } from '../utils/drinks.js';
import { formatFcfa, PAYMENT_LABELS } from '../utils/format.js';

// Meta refuse les paramètres de modèle contenant des retours à la ligne,
// des tabulations ou plus de 4 espaces consécutifs.
export const clean = (s, max = 900) =>
  String(s ?? '')
    .replace(/[\r\n\t]+/g, ' · ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max) || '-';

// « 2× N°1 Menu Classic (Menu, Coca-Cola), 1× Fanta » : les plats sur une ligne
export const itemsText = (items) =>
  items
    .map((i) => {
      const extra = [i.variantLabel, i.choice, drinksText(i.drinks, i.quantity)].filter(Boolean).join(', ');
      return `${i.quantity}× ${i.productNumber ? `N°${i.productNumber} ` : ''}${i.productName}${extra ? ` (${extra})` : ''}`;
    })
    .join(', ');

// Commande saisie par un agent : « Awa Traoré (+226…) · Appel, saisie par Awa ». Ajouté au client ({{2}}),
// pour garder les 6 variables du modèle Meta déjà approuvé.
const origin = (order) => (order.createdByName ? ` · ${order.sourceName || 'Site'}, saisie par ${order.createdByName}` : '');

export function buildNewOrderParams(order) {
  const items = itemsText(order.items);

  const payment = `${PAYMENT_LABELS[order.paymentMethod]} depuis ${order.paymentPayerPhone}`;

  const place = order.mode === 'A_EMPORTER' ? 'À emporter : le client vient la retirer au restaurant' : [
    order.latitude != null ? `https://maps.google.com/?q=${order.latitude},${order.longitude}` : null,
    order.addressNote,
  ]
    .filter(Boolean)
    .join(' · ');

  // Ordre = {{1}} à {{6}} du modèle "nouvelle_commande"
  return [
    order.reference,
    `${order.customerName} (${order.customerPhone})${origin(order)}`,
    items,
    formatFcfa(order.itemsTotal),
    payment,
    place,
  ].map((p) => clean(p));
}
