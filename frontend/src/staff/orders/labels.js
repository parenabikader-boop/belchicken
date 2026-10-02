// Libellés et petites aides d'affichage des commandes (espace équipe)

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
