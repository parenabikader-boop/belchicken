import { formatFcfa, PAYMENT_LABELS } from '../utils/format.js';

// Contenu des notifications de l'équipe. Elles peuvent s'afficher sur l'écran verrouillé :
// ni nom ni téléphone du client, seulement de quoi savoir qu'il faut ouvrir l'application.

export function newOrderNotification(order) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  return {
    title: `Nouvelle commande ${order.reference} · ${formatFcfa(order.itemsTotal)}`,
    body:
      `${count} article${count > 1 ? 's' : ''}${order.mode === 'A_EMPORTER' ? ' · à emporter' : ''} · ${PAYMENT_LABELS[order.paymentMethod] || 'Paiement'} à vérifier` +
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
// À emporter : « Commande BC-XXXX retirée au comptoir à 14:32 ».
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
