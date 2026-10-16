import { formatFcfa, PAYMENT_LABELS } from '../utils/format.js';

// Contenu des notifications de l'équipe. Elles peuvent s'afficher sur l'écran verrouillé :
// ni nom ni téléphone du client, seulement de quoi savoir qu'il faut ouvrir l'application.

export function newOrderNotification(order) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  return {
    title: `Nouvelle commande ${order.reference} · ${formatFcfa(order.itemsTotal)}`,
    body:
      `${count} article${count > 1 ? 's' : ''}${order.mode === 'A_EMPORTER' ? ' · à récupérer' : ''} · ${PAYMENT_LABELS[order.paymentMethod] || 'Paiement'} à vérifier` +
      // Saisie par un agent : provenance et agent (jamais le client sur l'écran verrouillé)
      (order.createdByName ? ` · ${order.sourceName || 'Site'}, saisie par ${order.createdByName}` : ''),
    url: `/equipe/commandes/${encodeURIComponent(order.reference)}`,
    tag: `commande-${order.reference}`, // une seule notification par commande
  };
}

// Nouvelle course pour un livreur. Pas d'adresse ni de nom sur l'écran verrouillé :
// tout est dans l'application.
export function courseNotification(order) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  return {
    title: `Nouvelle course ${order.reference}`,
    body: `${count} article${count > 1 ? 's' : ''} à livrer · ouvrez pour l’adresse et le client`,
    url: '/equipe/courses',
    tag: `course-${order.reference}`,
  };
}

// Commande livrée : à l'équipe (Patron et Opérateurs), pour remercier le client.
// « Commande BC-XXXX livrée par Issa à 14:32 ». Heure du Burkina = UTC.
// À récupérer : « Commande BC-XXXX retirée au comptoir à 14:32 ».
export function deliveredNotification(order, { courierName, at, byAgent = null, auto = false }) {
  const time = new Date(at).toISOString().slice(11, 16).replace(':', ' h ');
  const pickup = order.mode === 'A_EMPORTER';
  const who = !pickup && courierName ? ` par ${courierName}` : '';
  const how = !pickup && byAgent ? `Validée sans code par ${byAgent}. ` : '';
  return {
    title: `Commande ${order.reference} ${pickup ? 'retirée au comptoir' : 'livrée'}${who} à ${time}`,
    body: auto ? `${how}Remerciement envoyé automatiquement au client.` : `${how}Remerciez le client sur WhatsApp, puis confirmez l’envoi.`,
    url: `/equipe/commandes/${encodeURIComponent(order.reference)}`,
    tag: `livree-${order.reference}`,
  };
}

// Course annulée pendant la livraison : le livreur ne doit pas la remettre
export const courseCancelledNotification = (order) => ({
  title: `Course ${order.reference} annulée`,
  body: 'Ne livrez pas cette commande. Ouvrez l’application pour le détail.',
  url: '/equipe/courses',
  tag: `course-${order.reference}`,
});

// Lot 5c : le Responsable livraison retire la course avant la récupération
export const courseRemovedNotification = (order) => ({
  title: `Course ${order.reference} retirée`,
  body: 'Le responsable livraison a repris cette commande : ne venez pas la récupérer.',
  url: '/equipe/courses',
  tag: `course-${order.reference}`,
});

// Lot 5c : la commande confiée au livreur est prête, il peut venir la récupérer
export const courseReadyNotification = (order) => ({
  title: `Course ${order.reference} prête`,
  body: 'Le sac est prêt au restaurant : venez le récupérer, puis appuyez sur « Commande récupérée ».',
  url: '/equipe/courses',
  tag: `course-${order.reference}`,
});

// Lot 5c : alertes du Responsable livraison (commande prête, commande sans livreur). Jamais de montant des
// plats : la référence, le quartier et le livreur seulement.
export function partnerNotification(order, kind) {
  const zone = order.deliveryZoneName ? ` · ${order.deliveryZoneName}` : '';
  if (kind === 'PRETE') {
    return {
      title: `Commande ${order.reference} prête pour livraison`,
      body: order.courierName ? `${order.courierName} peut la récupérer${zone}.` : `Aucun livreur : choisissez-en un${zone}.`,
      url: '/equipe/livraison',
      tag: `livraison-${order.reference}`,
    };
  }
  return {
    title: `Commande ${order.reference} à attribuer`,
    body: `En préparation au restaurant, sans livreur${zone}. Choisissez un livreur.`,
    url: '/equipe/livraison',
    tag: `livraison-${order.reference}`,
  };
}

// Plan 1 : livraison validée par le livreur SANS le code du client (motif obligatoire), au Responsable livraison.
// Ni nom ni téléphone du client : le motif et le livreur seulement.
export function noCodeNotification(order, reason) {
  const text = String(reason || '').trim();
  return {
    title: `Livrée SANS CODE : ${order.reference}`,
    body: `${order.courierName || 'Le livreur'} a validé sans le code du client. Motif : ${text.length > 120 ? `${text.slice(0, 119)}…` : text}`,
    url: '/equipe/livraison',
    tag: `sans-code-${order.reference}`,
  };
}

// Lot 7 : mauvais avis (une note de 2 ou moins). Ni nom ni téléphone du client sur l'écran verrouillé :
// tout est dans la page Avis. Patron et Prestataire : les notes qui sont mauvaises ; Responsable livraison
// (forPartner) : seulement la note de livraison de notre équipe, jamais les autres.
export function lowReviewNotification(order, review, { forPartner = false } = {}) {
  if (forPartner) {
    return {
      title: `Mauvaise note de livraison · ${order.reference}`,
      body: `Livraison : ${review.deliveryRating}/5${order.courierName ? ` · ${order.courierName}` : ''}.`,
      url: '/equipe/livraison?onglet=avis',
      tag: `avis-livraison-${order.reference}`,
    };
  }
  const low = [
    ['Call center', review.callCenterRating],
    ['Restaurant', review.foodRating],
    ['Livraison', review.deliveryRating],
  ].filter(([, n]) => n != null && n <= 2);
  return {
    title: `Mauvais avis · ${order.reference}`,
    body: `${low.map(([label, n]) => `${label} : ${n}/5`).join(' · ')}. Rappelez le client.`,
    url: '/equipe/avis',
    tag: `avis-${order.reference}`,
  };
}

export const testNotification = () => ({
  title: 'Notification d’essai',
  body: 'Les alertes Belchicken fonctionnent sur ce téléphone.',
  url: '/equipe/alertes',
  tag: 'essai',
});

// « Android · Chrome », « iPhone · Safari »… pour reconnaître un téléphone dans la liste
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  const os = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android'
    : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'Appareil';
  const browser = /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /edg\//i.test(ua) ? 'Edge'
    : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}
