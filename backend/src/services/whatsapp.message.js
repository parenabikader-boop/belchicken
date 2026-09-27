import { formatFcfa, PAYMENT_LABELS } from '../utils/format.js';

// Meta refuse les paramètres de modèle contenant des retours à la ligne,
// des tabulations ou plus de 4 espaces consécutifs.
const clean = (s, max = 900) =>
  String(s ?? '')
    .replace(/[\r\n\t]+/g, ' · ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max) || '-';

export function buildNewOrderParams(order) {
  const items = order.items
    .map((i) => {
      const extra = [i.variantLabel, i.choice].filter(Boolean).join(', ');
      return `${i.quantity}× ${i.productNumber ? `N°${i.productNumber} ` : ''}${i.productName}${extra ? ` (${extra})` : ''}`;
    })
    .join(', ');

  const payment =
    order.paymentMethod === 'ESPECES'
      ? PAYMENT_LABELS.ESPECES
      : `${PAYMENT_LABELS[order.paymentMethod]}, réf. ${order.paymentReference}, depuis ${order.paymentPayerPhone}`;

  const place = [
    order.latitude != null ? `https://maps.google.com/?q=${order.latitude},${order.longitude}` : null,
    order.addressNote,
  ]
    .filter(Boolean)
    .join(' · ');

  // Ordre = {{1}} à {{6}} du modèle "nouvelle_commande"
  return [
    order.reference,
    `${order.customerName} (${order.customerPhone})`,
    items,
    formatFcfa(order.itemsTotal),
    payment,
    place,
  ].map((p) => clean(p));
}
