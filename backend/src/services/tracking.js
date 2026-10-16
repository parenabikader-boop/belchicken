// Plan 4, suivi du client sans messages payants (interrupteur SUIVI_SANS_WHATSAPP, fermé sans ligne). Règles sans
// base de données, testées dans test/suivi-sans-whatsapp.test.js. Accès à la base : order.service.js (page de
// suivi) et customer-push.service.js (alertes sur le téléphone du client).
//
// - Clé secrète du lien de suivi (Order.trackingKey), créée à la commande quand le suivi est actif, donnée une seule
//   fois au client (réponse de la commande), qui la garde dans son lien : /suivi/BC-…?cle=….
// - Avec la clé : le livreur (nom et numéro, pour l'appeler), le code de livraison (ou de retrait), le montant à
//   payer au livreur, le lien « Donner mon avis », les alertes. Sans la clé : ni code, ni montant, ni livreur.
// - Interrupteur fermé, ou commande sans clé (passée avant) : la page est exactement celle d'avant.
// - Call center : plus de message à confirmer ni de client à remercier (comme avec l'envoi automatique).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const TRACKING_KEY_RE = /^[A-Za-z0-9_-]{24}$/;
// 144 bits au hasard, 24 caractères (base64 « url »)
export const newTrackingKey = () => randomBytes(18).toString('base64url');
export const isTrackingKey = (text) => typeof text === 'string' && TRACKING_KEY_RE.test(text);

// La clé donnée est-elle celle de la commande ? (comparaison à temps constant)
export function keyMatches(order, key) {
  if (!order?.trackingKey || !isTrackingKey(key)) return false;
  const a = Buffer.from(order.trackingKey);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Lien de suivi (chemin du site client)
export const trackingPath = (reference, key) => `/suivi/${encodeURIComponent(reference)}?cle=${encodeURIComponent(key)}`;

// Plus de message à confirmer ni de remerciement pour le call center : envoi automatique, ou suivi sans WhatsApp
export const quietMode = ({ auto = false, trackingOpen = false } = {}) => Boolean(auto || trackingOpen);

const FINAL = ['LIVREE', 'ANNULEE'];

// Ce que la page montre en plus, avec la bonne clé. `order` : avec courierName, courier { phone }, deliveryCode.
// reviewLink : lien de l'avis (lot 7) s'il est actif ; pushKey : clé publique VAPID (null = alertes indisponibles).
export function trackingExtras(order, { reviewLink = null, pushKey = null } = {}) {
  const delivery = order.mode !== 'A_EMPORTER';
  const onTheWay = delivery && order.status === 'EN_LIVRAISON';
  const ready = !delivery && order.status === 'PRETE';
  return {
    courier: onTheWay && order.courierName ? { name: order.courierName, phone: order.courier?.phone || null } : null,
    code: onTheWay || ready ? order.deliveryCode || null : null,
    reviewUrl: order.status === 'LIVREE' ? reviewLink || null : null,
    push: pushKey && !FINAL.includes(order.status) ? { publicKey: pushKey } : null,
  };
}

// Sans la clé : la page ne montre aucun montant de livraison (ni les codes marchands avec le montant)
export const lockedView = (publicOrder) => ({ ...publicOrder, deliveryFee: null, deliveryNightFee: null, feePayment: null, trackingLocked: true });

// ─────────── Alertes sur le téléphone du client ───────────

export const MAX_CUSTOMER_DEVICES = 5; // téléphones par commande

// Demande d'alertes envoyée par la page de suivi
export const customerSubscriptionSchema = z.object({
  cle: z.string().max(40),
  subscription: z.object({
    endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Adresse d’alerte invalide.'),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  }),
});

const TEXTS = {
  FR: {
    route: { title: 'Votre commande est en route', body: (who) => `${who} vous l’apporte. Ouvrez votre suivi : code de livraison, montant à payer au livreur et bouton pour l’appeler.` },
    ready: { title: 'Votre commande est prête', body: 'Venez la retirer au restaurant. Ouvrez votre suivi pour voir votre code de retrait.' },
    delivered: { title: 'Commande livrée, merci !', body: 'Merci d’avoir commandé chez Belchicken Burkina. Bon appétit ! Donnez-nous votre avis sur votre page de suivi.' },
    pickedUp: { title: 'Commande retirée, merci !', body: 'Merci d’avoir commandé chez Belchicken Burkina. Bon appétit !' },
    courier: 'Votre livreur',
  },
  EN: {
    route: { title: 'Your order is on its way', body: (who) => `${who} is bringing it to you. Open your tracking page: delivery code, amount to pay the rider and a button to call them.` },
    ready: { title: 'Your order is ready', body: 'Come and collect it at the restaurant. Open your tracking page to see your pickup code.' },
    delivered: { title: 'Order delivered, thank you!', body: 'Thank you for ordering from Belchicken Burkina. Enjoy your meal! Tell us what you think on your tracking page.' },
    pickedUp: { title: 'Order collected, thank you!', body: 'Thank you for ordering from Belchicken Burkina. Enjoy your meal!' },
    courier: 'Your rider',
  },
};

// Alerte de l'étape (null = pas d'alerte pour cette étape). Jamais le code ni le montant sur l'écran verrouillé :
// ils sont sur la page de suivi, ouverte par l'alerte.
export function customerPushPayload(order) {
  const T = TEXTS[order.language === 'EN' ? 'EN' : 'FR'];
  const delivery = order.mode !== 'A_EMPORTER';
  let text = null;
  if (delivery && order.status === 'EN_LIVRAISON') text = { title: T.route.title, body: T.route.body(order.courierName || T.courier) };
  else if (!delivery && order.status === 'PRETE') text = T.ready;
  else if (order.status === 'LIVREE') text = delivery ? T.delivered : T.pickedUp;
  if (!text || !order.trackingKey) return null;
  return {
    title: text.title,
    body: text.body,
    url: trackingPath(order.reference, order.trackingKey),
    tag: `suivi-${order.reference}`,
    client: true,
    lang: order.language === 'EN' ? 'en' : 'fr',
  };
}
