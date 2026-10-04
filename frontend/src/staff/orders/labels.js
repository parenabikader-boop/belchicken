// Libellés et petites aides d'affichage des commandes (espace équipe)
import { formatPrice } from '../../utils/format.js';

export const STATUS_LABEL = {
  PAIEMENT_A_VERIFIER: 'Paiement à vérifier',
  PAYEE: 'Payée',
  EN_PREPARATION: 'En préparation',
  EN_LIVRAISON: 'En livraison',
  LIVREE: 'Livrée',
  ANNULEE: 'Annulée',
};

// Filtres de la liste, dans l'ordre des onglets. EN_COURS = toutes les commandes non terminées.
export const ACTIVE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON'];
export const FILTERS = [
  { id: 'EN_COURS', label: 'En cours' },
  { id: 'PAIEMENT_A_VERIFIER', label: 'À vérifier' },
  { id: 'PAYEE', label: 'Payées' },
  { id: 'EN_PREPARATION', label: 'En préparation' },
  { id: 'EN_LIVRAISON', label: 'En livraison' },
  { id: 'LIVREE', label: 'Livrées' },
  { id: 'ANNULEE', label: 'Annulées' },
  { id: 'TOUTES', label: 'Toutes' },
];

// Bouton principal de chaque statut : passage au statut suivant
export const NEXT_ACTION = {
  PAIEMENT_A_VERIFIER: { to: 'PAYEE', label: 'Paiement reçu' },
  PAYEE: { to: 'EN_PREPARATION', label: 'Commencer la préparation' },
  EN_PREPARATION: { to: 'EN_LIVRAISON', label: 'Partie en livraison' },
  EN_LIVRAISON: { to: 'LIVREE', label: 'Livrée au client' },
};

export const METHOD_LABEL = { ORANGE_MONEY: 'Orange Money', MOOV_MONEY: 'Moov Money', ESPECES: 'Espèces' };

// +22676123456 -> "+226 76 12 34 56"
export function formatPhone(phone) {
  const m = /^\+226(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone || '');
  return m ? `+226 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone || '';
}
export const telHref = (phone) => `tel:${phone}`;
export const whatsappHref = (phone) => `https://wa.me/${(phone || '').replace(/\D/g, '')}`;
export const mapsHref = ({ latitude, longitude }) => `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

export const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// "à l'instant", "il y a 12 min", "il y a 2 h", sinon la date
export function timeAgo(iso, now = Date.now()) {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60) return `il y a ${Math.floor(min / 60)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${formatTime(iso)}`;
}

// Frais de livraison : modifiables jusqu'au départ du livreur (mêmes règles que l'API, order-status.js)
export const FEE_EDITABLE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION'];
// Ce qui empêche le livreur de partir, ou null
export function deliveryBlock(o) {
  if (o.deliveryFee == null) return 'Saisissez d’abord les frais de livraison ci-dessous.';
  if (!o.deliveryFeeReceivedAt) return 'Le livreur part une fois les frais reçus : cochez « Frais reçus » après vérification sur le téléphone marchand.';
  return null;
}

// Historique : statuts et autres événements (frais, messages), du plus récent au plus ancien
export function timelineOf(o) {
  const statuses = o.history.map((h) => ({
    kind: `p-${h.toStatus}`,
    title: h.fromStatus ? STATUS_LABEL[h.toStatus] : 'Commande reçue',
    note: h.reason ? `Motif : ${h.reason}` : null,
    by: h.by || 'site de commande',
    at: h.at,
  }));
  const events = (o.events || []).map((e) => ({
    kind: `e-${e.type}`,
    title: {
      FRAIS_SAISIS: `Frais de livraison : ${formatPrice(e.amount)}`,
      FRAIS_RECUS: 'Frais de livraison reçus',
      FRAIS_NON_RECUS: '« Frais reçus » décoché',
      MESSAGE_PREPARE: 'Message WhatsApp préparé',
    }[e.type],
    note: e.type === 'MESSAGE_PREPARE' ? e.messageLabel : null,
    by: e.by,
    at: e.at,
  }));
  return [...statuses, ...events].sort((a, b) => new Date(b.at) - new Date(a.at));
}
