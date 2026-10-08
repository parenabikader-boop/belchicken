// Frais de livraison affichés au client (montants toujours calculés par le serveur)
import { formatPrice } from './format.js';

// 0 F = livraison offerte (grille du Patron)
export const feeLabel = (fee) => (fee === 0 ? 'Livraison offerte' : formatPrice(fee));

export const FEE_PAID_TO_COURIER = 'Payés au livreur à la réception, en espèces ou par mobile money avec le code marchand.';
export const FEE_TO_CONFIRM = 'Confirmés par notre équipe au téléphone';

// Recherche de quartier sans tenir compte des majuscules ni des accents
export const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
