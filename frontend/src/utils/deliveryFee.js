// Frais de livraison affichés au client (montants toujours calculés par le serveur)
import { formatPrice } from './format.js';

// 0 F = livraison offerte (grille du Patron)
export const feeLabel = (fee) => (fee === 0 ? 'Livraison offerte' : formatPrice(fee));

export const FEE_PAID_TO_COURIER = 'Payés au livreur à la réception, en espèces ou par mobile money avec le code marchand.';
export const FEE_TO_CONFIRM = 'Confirmés par notre équipe au téléphone';

// Recherche de quartier sans tenir compte des majuscules ni des accents
export const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

// Lot 3 : supplément de nuit (compris dans les frais) : « dont 500 F de supplément de nuit »
export const nightLine = (nightFee) => `dont ${formatPrice(nightFee)} de supplément de nuit`;
// « 1 500 F, dont 500 F de supplément de nuit », ou « 1 000 F » / « Livraison offerte »
export const feeWithNight = (fee, nightFee) => (nightFee ? `${formatPrice(fee)}, ${nightLine(nightFee)}` : feeLabel(fee));
// Heures de nuit « 22:00 » → « 22 h », « 06:30 » → « 6 h 30 »
export const hourLabel = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
