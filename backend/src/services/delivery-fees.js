// Grille des frais de livraison (sans base de données, testée dans test/delivery-fees.test.js).
//
// Le Patron règle des quartiers avec leur prix, des tranches de distance depuis le restaurant (à vol
// d'oiseau) et l'option « Autre quartier ». Le client choisit son quartier ou partage sa position ;
// le serveur calcule les frais, toujours, et les copie dans la commande (montant, nom du quartier,
// distance) : un prix changé ensuite ne modifie pas les commandes déjà passées.
// 0 F = livraison offerte (grille seulement). Grille vide : l'équipe saisit les frais comme avant.
import { z } from 'zod';
import { FEE_MAX } from './order-status.js';
import { formatFcfa } from '../utils/format.js';

export const GRID_FEE_MIN = 0; // livraison offerte
export const BAND_MIN_METERS = 100;
export const BAND_MAX_METERS = 100000;
// Position GPS moins précise que 1 km : la tranche n'est pas sûre, frais à confirmer par l'agent
export const MAX_ACCURACY_METERS = 1000;
export const ZONE_NAME_MAX = 60;

// Distance à vol d'oiseau entre deux positions, en mètres (formule de haversine)
export function distanceMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Ce qui compte pour les clients : quartiers et tranches actifs, dans l'ordre
export function activeGrid({ zones = [], bands = [], settings = null }) {
  const activeZones = zones.filter((z) => z.isActive).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'));
  const activeBands = bands.filter((b) => b.isActive).sort((a, b) => a.upToMeters - b.upToMeters);
  return {
    zones: activeZones,
    bands: activeBands,
    allowOther: settings?.allowOtherZone ?? true,
    isEmpty: activeZones.length === 0 && activeBands.length === 0,
  };
}

// Tranches avec leur début (la fin de la tranche active précédente)
export const bandRanges = (bands) => bands.map((b, i) => ({ ...b, fromMeters: i ? bands[i - 1].upToMeters : 0 }));

// Tranche d'une distance : de « début » (exclu, sauf 0) à « fin » (comprise). null = au-delà de la dernière.
export const bandFor = (bands, meters) => bands.find((b) => meters <= b.upToMeters) || null;

const toConfirm = (extra = {}) => ({ source: 'A_CONFIRMER', fee: null, zoneId: null, zoneName: null, distanceM: null, ...extra });

// Frais pour une livraison. choice : { zoneId } (quartier choisi), { other: true } (autre quartier),
// et/ou location ({ latitude, longitude, accuracy }). Le quartier choisi passe avant la position, qui sert
// alors seulement au livreur. legacy = ancienne version du site, qui n'envoie aucun choix.
// Renvoie { source, fee, zoneId, zoneName, distanceM } (fee null = à confirmer), ou { error }.
// Grille vide : { source: null } (frais saisis par l'équipe, comme avant).
export function quoteDelivery(grid, { zoneId, other, location, legacy = false } = {}, restaurant) {
  if (grid.isEmpty) return { source: null, fee: null, zoneId: null, zoneName: null, distanceM: null };
  if (zoneId) {
    const zone = grid.zones.find((z) => z.id === zoneId);
    if (!zone) return { error: 'Ce quartier n’est plus proposé. Choisissez-en un autre dans la liste.' };
    return { source: 'QUARTIER', fee: zone.fee, zoneId: zone.id, zoneName: zone.name, distanceM: null };
  }
  if (other) {
    if (!grid.allowOther && !legacy) return { error: 'Choisissez votre quartier dans la liste ou partagez votre position.' };
    return toConfirm();
  }
  if (location && grid.bands.length) {
    const distanceM = distanceMeters(restaurant, location);
    if (location.accuracy != null && location.accuracy > MAX_ACCURACY_METERS) return toConfirm({ distanceM });
    const band = bandFor(grid.bands, distanceM);
    return band ? { source: 'DISTANCE', fee: band.fee, zoneId: null, zoneName: null, distanceM } : toConfirm({ distanceM });
  }
  // Ancienne version du site (aucun choix envoyé) : l'agent fixe les frais, comme avant
  if (legacy) return toConfirm();
  if (location) {
    // Position sans tranche réglée : le quartier reste nécessaire, sauf « Autre quartier »
    return grid.allowOther ? toConfirm() : { error: 'Choisissez votre quartier dans la liste.' };
  }
  return { error: grid.bands.length ? 'Choisissez votre quartier ou partagez votre position.' : 'Choisissez votre quartier.' };
}

// Le site a montré un montant au client : refusé si le serveur trouve autre chose (prix changé entre-temps)
export function expectedFeeError(quote, expectedFee) {
  if (expectedFee === undefined) return null;
  if (quote.fee === expectedFee) return null;
  return quote.fee == null
    ? 'Les frais de livraison ont changé : ils seront confirmés par notre équipe au téléphone. Vérifiez puis validez à nouveau.'
    : `Les frais de livraison ont changé : ${quote.fee === 0 ? 'livraison offerte' : formatFcfa(quote.fee)}. Vérifiez puis validez à nouveau.`;
}

// Ce que le site public reçoit pour la page Valider
export const publicGrid = (grid) => ({
  active: !grid.isEmpty,
  zones: grid.zones.map((z) => ({ id: z.id, name: z.name, fee: z.fee })),
  gps: grid.bands.length > 0,
  allowOther: grid.allowOther,
});

// Champs de la commande, copiés au moment de la commande
export const orderFeeFields = (quote) =>
  quote.source
    ? {
        deliveryFee: quote.fee,
        deliveryFeeSource: quote.source,
        deliveryZoneId: quote.zoneId,
        deliveryZoneName: quote.zoneName,
        deliveryDistanceM: quote.distanceM,
      }
    : {};

// ─────────── Correction des frais par l'équipe ───────────
// Avant le départ du livreur : Patron et Opérateur. Après (en livraison, ou livrée tant que les frais
// ne sont ni vérifiés ni remis au restaurant) : Patron seulement. Motif obligatoire dès que des frais
// existent déjà ; la première saisie (frais à confirmer, grille vide) n'en demande pas.
const EDITABLE_BY_ALL = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION'];
const EDITABLE_BY_PATRON = ['EN_LIVRAISON', 'LIVREE'];

// Qui peut encore modifier les frais : 'TOUS', 'PATRON' ou null (avec la raison)
export function feeEditRight(order) {
  if (order.mode === 'A_EMPORTER') return { who: null, error: 'Commande à emporter : pas de frais de livraison.' };
  if (EDITABLE_BY_ALL.includes(order.status)) {
    // Anciennes commandes (avant le 6 octobre 2026) : frais payés avant le départ du livreur
    if (order.deliveryFeeMethod != null) return { who: null, error: 'Les frais de cette commande sont déjà payés.' };
    return { who: 'TOUS' };
  }
  if (EDITABLE_BY_PATRON.includes(order.status)) {
    if (order.deliveryFeeVerifiedAt) return { who: null, error: 'Ces frais sont déjà vérifiés sur le téléphone marchand : ils ne se corrigent plus.' };
    if (order.cashRemittanceId) return { who: null, error: 'Ces frais ont déjà été remis au restaurant : ils ne se corrigent plus.' };
    // Livrée sans rien encaisser (livraison offerte) : le livreur n'a plus rien à demander au client
    if (order.status === 'LIVREE' && order.deliveryFeeMethod == null) return { who: null, error: 'Commande livrée sans frais encaissés : les frais ne se corrigent plus.' };
    return { who: 'PATRON' };
  }
  return { who: null, error: 'Les frais de cette commande ne se modifient plus.' };
}

// null si permis, sinon le message. amount : nouveau montant (au moins 1 F quand l'équipe le saisit)
export function feeCorrectionError(order, role, amount, reason) {
  const right = feeEditRight(order);
  if (!right.who) return right.error;
  if (right.who === 'PATRON' && role !== 'PATRON') return 'Le livreur est parti : seul le Patron peut encore corriger les frais.';
  if (order.deliveryFee != null && (!reason || reason.trim().length < 3)) return 'Indiquez le motif de la correction des frais.';
  if (order.deliveryFee === amount) return 'Les frais sont déjà de ce montant.';
  return null;
}

// ─────────── Page « Frais de livraison » du Patron ───────────
const fee = z
  .number({ required_error: 'Indiquez le prix.', invalid_type_error: 'Indiquez le prix en F.' })
  .int('Prix en F, sans centimes.')
  .min(GRID_FEE_MIN, 'Le prix ne peut pas être négatif (0 F = livraison offerte).')
  .max(FEE_MAX, 'Prix trop élevé (50 000 F au plus).');

export const zoneSchema = z.object({
  name: z
    .string({ required_error: 'Indiquez le nom du quartier.' })
    .trim()
    .min(2, 'Indiquez le nom du quartier.')
    .max(ZONE_NAME_MAX, `Nom trop long (${ZONE_NAME_MAX} caractères au plus).`),
  fee,
  isActive: z.boolean().default(true),
});
export const zoneUpdateSchema = zoneSchema.partial();

// Le Patron tape des km (2,5 km), enregistrés en mètres
export const bandSchema = z.object({
  upToKm: z
    .number({ required_error: 'Indiquez la distance en km.', invalid_type_error: 'Indiquez la distance en km.' })
    .min(BAND_MIN_METERS / 1000, 'La tranche doit aller au moins jusqu’à 0,1 km.')
    .max(BAND_MAX_METERS / 1000, 'Distance trop grande (100 km au plus).')
    .transform((km) => Math.round(km * 10) * 100), // à 100 m près
  fee,
  isActive: z.boolean().default(true),
});
export const bandUpdateSchema = bandSchema.partial();

export const settingsSchema = z.object({ allowOtherZone: z.boolean() });

// Même nom de quartier, sans tenir compte des majuscules, accents ni espaces en trop
export const sameZoneName = (a, b) =>
  a.trim().replace(/\s+/g, ' ').localeCompare(b.trim().replace(/\s+/g, ' '), 'fr', { sensitivity: 'base' }) === 0;

// Choix du client, envoyé avec la commande et pour l'aperçu des frais (POST /api/delivery/quote)
export const deliveryChoiceSchema = z.object({
  zoneId: z.string().max(40).optional(),
  other: z.boolean().optional(),
  // Montant affiché au client (null = à confirmer) : seulement comparé, jamais utilisé comme prix
  expectedFee: z.number().int().min(0).max(FEE_MAX).nullable().optional(),
});
