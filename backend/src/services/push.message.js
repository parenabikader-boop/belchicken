import { formatFcfa, PAYMENT_LABELS } from '../utils/format.js';

// Contenu des notifications de l'équipe. Elles peuvent s'afficher sur l'écran verrouillé :
// ni nom ni téléphone du client, seulement de quoi savoir qu'il faut ouvrir l'application.

export function newOrderNotification(order) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  return {
    title: `Nouvelle commande ${order.reference} · ${formatFcfa(order.itemsTotal)}`,
    body: `${count} article${count > 1 ? 's' : ''} · ${PAYMENT_LABELS[order.paymentMethod] || 'Paiement'} à vérifier`,
    url: `/equipe/commandes/${encodeURIComponent(order.reference)}`,
    tag: `commande-${order.reference}`, // une seule notification par commande
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
