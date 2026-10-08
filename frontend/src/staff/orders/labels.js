// Libellés et petites aides d'affichage des commandes (espace équipe)
import { formatPrice } from '../../utils/format.js';

export const STATUS_LABEL = {
  PAIEMENT_A_VERIFIER: 'Paiement à vérifier',
  PAYEE: 'Payée',
  EN_PREPARATION: 'En préparation',
  EN_LIVRAISON: 'En livraison',
  PRETE: 'Prête à retirer',
  LIVREE: 'Livrée',
  ANNULEE: 'Annulée',
};

// À emporter : retirée au restaurant (PRETE, puis LIVREE affichée « Retirée »), sans frais ni livreur
export const isPickup = (o) => o?.mode === 'A_EMPORTER';
export const statusLabel = (o, status = o.status) => (isPickup(o) && status === 'LIVREE' ? 'Retirée' : STATUS_LABEL[status]);

export const ACTIVE = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'PRETE'];

// Étapes de la page Commandes, dans l'ordre du travail : un onglet (téléphone) ou une colonne
// (ordinateur) par statut, avec l'action à faire. Puis l'historique (livrées et annulées).
export const STAGES = [
  {
    id: 'PAIEMENT_A_VERIFIER',
    label: 'À vérifier',
    hint: 'Vérifiez ces paiements sur le téléphone marchand, puis confirmez-les avec les frais de livraison (aucun frais pour les commandes à emporter).',
    empty: 'Aucun paiement à vérifier.',
  },
  {
    id: 'PAYEE',
    label: 'Payées',
    hint: 'Lancez la préparation. Les frais de livraison seront payés au livreur, à la réception.',
    empty: 'Aucune commande à lancer.',
  },
  {
    id: 'EN_PREPARATION',
    label: 'En préparation',
    hint: 'Préparez ces commandes, puis choisissez le livreur au départ. À emporter : prévenez le client qu’elle est prête.',
    empty: 'Aucune commande en préparation.',
  },
  {
    id: 'EN_LIVRAISON',
    label: 'En livraison',
    hint: 'Le livreur valide la remise avec le code du client. Appelez-le si une course traîne.',
    empty: 'Aucune commande en route.',
  },
  {
    // À emporter : prêtes, le client vient au comptoir
    id: 'PRETE',
    label: 'À retirer',
    hint: 'Commandes à emporter prêtes : au comptoir, tapez le code de retrait du client, puis remettez-lui la commande.',
    empty: 'Aucune commande à retirer.',
  },
  {
    // Livrées dont le remerciement n'est pas encore confirmé (toThank, calculé par l'API).
    // Avec l'envoi automatique, cette étape reste vide : les livrées vont directement dans l'historique.
    id: 'A_REMERCIER',
    label: 'Livrées · à remercier',
    hint: 'Livrées ou retirées au comptoir : remerciez le client sur WhatsApp, puis confirmez l’envoi. La commande passe ensuite dans l’historique.',
    empty: 'Aucun client à remercier.',
  },
];
export const HISTORY = { id: 'HISTORIQUE', label: 'Historique', hint: 'Commandes terminées : livrées ou retirées et remerciées, ou annulées.' };
export const HISTORY_FILTERS = [
  { id: 'LIVREE', label: 'Livrées / retirées' },
  { id: 'ANNULEE', label: 'Annulées' },
];

// Bouton unique de chaque étape : passage à l'étape suivante ET message au client (OrderSteps.jsx).
// Les frais de livraison sont payés au livreur à la réception : rien à attendre avant la préparation.
export const NEXT_ACTION = {
  PAIEMENT_A_VERIFIER: { to: 'PAYEE', label: 'Confirmer le paiement et prévenir le client' },
  PAYEE: { to: 'EN_PREPARATION', label: 'Lancer la préparation et prévenir le client' },
  EN_PREPARATION: { to: 'EN_LIVRAISON', label: 'Choisir le livreur et prévenir le client' },
  // Livrée : validée par le livreur avec le code du client, ou par l'agent avec un motif (OrderSteps.jsx)
  EN_LIVRAISON: { to: 'LIVREE', label: 'Livrée : remercier le client' },
};
// À emporter : « prête » au lieu du départ du livreur, puis remise au comptoir
const PICKUP_ACTION = {
  EN_PREPARATION: { to: 'PRETE', label: 'Commande prête : prévenir le client' },
  PRETE: { to: 'LIVREE', label: 'Remise au client : le remercier' },
};
export const nextAction = (o) => (isPickup(o) && PICKUP_ACTION[o.status]) || NEXT_ACTION[o.status];

export const METHOD_LABEL = { ORANGE_MONEY: 'Orange Money', MOOV_MONEY: 'Moov Money', TELECEL_MONEY: 'Telecel Money', ESPECES: 'Espèces' };

// Frais de livraison payés au livreur à la réception : comment le client les a payés
export const FEE_METHODS = [
  { id: 'ESPECES', label: 'Espèces', hint: 'remis au livreur en main propre' },
  { id: 'MOBILE_MONEY', label: 'Mobile money (code marchand)', hint: 'Orange Money, Moov Money ou Telecel Money' },
];
export const FEE_METHOD_LABEL = { ESPECES: 'en espèces', MOBILE_MONEY: 'par mobile money' };

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
  return null;
}

// Historique : statuts et autres événements (frais, messages), du plus récent au plus ancien
export function timelineOf(o) {
  const statuses = o.history.map((h) => ({
    kind: `p-${h.toStatus}`,
    title: h.fromStatus ? statusLabel(o, h.toStatus) : 'Commande reçue',
    note: h.reason ? `Motif : ${h.reason}` : null,
    by: h.by || 'site de commande',
    at: h.at,
  }));
  const events = (o.events || []).map((e) => ({
    kind: `e-${e.type}`,
    title: {
      FRAIS_SAISIS: `Frais de livraison : ${formatPrice(e.amount)}`,
      FRAIS_RECUS: 'Frais de livraison reçus avant le départ',
      FRAIS_NON_RECUS: '« Frais reçus » décoché',
      FRAIS_VERIFIES: `Frais vérifiés sur le téléphone marchand : ${formatPrice(e.amount)}`,
      FRAIS_NON_VERIFIES: 'Vérification des frais annulée',
      MESSAGE_PREPARE: 'WhatsApp ouvert avec le message',
      MESSAGE_ENVOYE: 'Message envoyé au client (confirmé)',
      CLIENT_APPELE: 'Client prévenu par appel',
      LIVREUR_ASSIGNE: `Livreur : ${e.courierName}`,
      CODE_INCORRECT: isPickup(o) ? 'Code de retrait faux, tapé au comptoir' : 'Code de remise faux, tapé par le livreur',
      LIVRAISON_SANS_CODE: 'Livraison validée sans code',
      RETRAIT_SANS_CODE: 'Remise au comptoir validée sans code',
    }[e.type],
    note: e.messageLabel || null,
    by: e.by,
    at: e.at,
  }));
  return [...statuses, ...events].sort((a, b) => new Date(b.at) - new Date(a.at));
}
