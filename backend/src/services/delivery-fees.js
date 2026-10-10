// Grille des frais de livraison (sans base de données, testée dans test/delivery-fees.test.js).
//
// Le Patron règle des quartiers avec leur prix, des tranches de distance depuis le restaurant (à vol
// d'oiseau) et l'option « Autre quartier ». Le client choisit son quartier ou partage sa position ;
// le serveur calcule les frais, toujours, et les copie dans la commande (montant, nom du quartier,
// distance) : un prix changé ensuite ne modifie pas les commandes déjà passées.
// 0 F = livraison offerte (grille seulement). Grille vide : l'équipe saisit les frais comme avant.
// Lot 3 : supplément de nuit par quartier et par tranche, ajouté aux frais pendant les heures de nuit
// réglées par le Patron (heure de la commande, heure du Burkina). Les frais restent un seul montant
// (supplément compris) ; le supplément est aussi copié à part (deliveryNightFee) pour les rapports.
// Réglage éteint ou supplément à 0 F : frais exactement comme avant.
import { z } from 'zod';
import { FEE_MAX } from './order-status.js';
import { formatFcfa } from '../utils/format.js';
import { isPatronLevel } from './roles.js';

export const GRID_FEE_MIN = 0; // livraison offerte
export const BAND_MIN_METERS = 100;
export const BAND_MAX_METERS = 100000;
// Position GPS moins précise que 1 km : la tranche n'est pas sûre, frais à confirmer par l'agent
export const MAX_ACCURACY_METERS = 1000;
export const ZONE_NAME_MAX = 60;

// ─────────── Heures de nuit (lot 3) ───────────
// Burkina Faso = heure UTC toute l'année (pas d'heure d'été), comme le tableau de bord.
export const burkinaMinutes = (date) => date.getUTCHours() * 60 + date.getUTCMinutes();

// Heures de nuit réglées (null = réglage éteint)
export const nightHours = (settings) =>
  settings?.nightEnabled ? { startMin: settings.nightStartMin, endMin: settings.nightEndMin } : null;

// Vrai si `date` tombe dans les heures de nuit. Début compris, fin exclue : 22 h 00 est la nuit, 6 h 00 le jour.
// Fin avant le début (22 h → 6 h) : la nuit passe minuit.
export function isNightTime(night, date = new Date()) {
  if (!night || night.startMin === night.endMin) return false;
  const t = burkinaMinutes(date);
  return night.startMin < night.endMin ? t >= night.startMin && t < night.endMin : t >= night.startMin || t < night.endMin;
}

// « 22:00 » <-> 1320
export const minutesToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const hhmmToMinutes = (s) => {
  const m = HHMM.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// « dont 500 F de supplément de nuit » ; frais : « 1 500 F (dont 500 F de supplément de nuit) » ou « 1 000 F »
export const nightPart = (nightFee) => `dont ${formatFcfa(nightFee)} de supplément de nuit`;
export const feeWithNight = (fee, nightFee) => (nightFee ? `${formatFcfa(fee)} (${nightPart(nightFee)})` : formatFcfa(fee));

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
    night: nightHours(settings),
    isEmpty: activeZones.length === 0 && activeBands.length === 0,
  };
}

// Tranches avec leur début (la fin de la tranche active précédente)
export const bandRanges = (bands) => bands.map((b, i) => ({ ...b, fromMeters: i ? bands[i - 1].upToMeters : 0 }));

// Tranche d'une distance : de « début » (exclu, sauf 0) à « fin » (comprise). null = au-delà de la dernière.
export const bandFor = (bands, meters) => bands.find((b) => meters <= b.upToMeters) || null;

// Supplément de nuit ajouté au prix de base : seulement la nuit, et s'il n'est pas de 0 F
const withNight = (grid, now, quote, nightFee) =>
  nightFee > 0 && isNightTime(grid.night, now) ? { ...quote, fee: quote.fee + nightFee, nightFee } : quote;

const toConfirm = (extra = {}) => ({ source: 'A_CONFIRMER', fee: null, zoneId: null, zoneName: null, distanceM: null, ...extra });

// Frais pour une livraison. choice : { zoneId } (quartier choisi), { other: true } (autre quartier),
// et/ou location ({ latitude, longitude, accuracy }). Le quartier choisi passe avant la position, qui sert
// alors seulement au livreur. legacy = ancienne version du site, qui n'envoie aucun choix.
// Renvoie { source, fee, zoneId, zoneName, distanceM } (fee null = à confirmer), ou { error }.
// La nuit, avec un supplément : fee le comprend et nightFee donne sa part.
// Grille vide : { source: null } (frais saisis par l'équipe, comme avant).
// now : heure de la commande (ou de l'aperçu).
export function quoteDelivery(grid, { zoneId, other, location, legacy = false } = {}, restaurant, now = new Date()) {
  if (grid.isEmpty) return { source: null, fee: null, zoneId: null, zoneName: null, distanceM: null };
  if (zoneId) {
    const zone = grid.zones.find((z) => z.id === zoneId);
    if (!zone) return { error: 'Ce quartier n’est plus proposé. Choisissez-en un autre dans la liste.' };
    return withNight(grid, now, { source: 'QUARTIER', fee: zone.fee, zoneId: zone.id, zoneName: zone.name, distanceM: null }, zone.nightFee);
  }
  if (other) {
    if (!grid.allowOther && !legacy) return { error: 'Choisissez votre quartier dans la liste ou partagez votre position.' };
    return toConfirm();
  }
  if (location && grid.bands.length) {
    const distanceM = distanceMeters(restaurant, location);
    if (location.accuracy != null && location.accuracy > MAX_ACCURACY_METERS) return toConfirm({ distanceM });
    const band = bandFor(grid.bands, distanceM);
    return band
      ? withNight(grid, now, { source: 'DISTANCE', fee: band.fee, zoneId: null, zoneName: null, distanceM }, band.nightFee)
      : toConfirm({ distanceM });
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
    : `Les frais de livraison ont changé : ${quoteText(quote)}. Vérifiez puis validez à nouveau.`;
}
// « livraison offerte », « 1 000 F » ou « 1 500 F, dont 500 F de supplément de nuit »
const quoteText = (q) => (q.fee === 0 ? 'livraison offerte' : q.nightFee ? `${formatFcfa(q.fee)}, ${nightPart(q.nightFee)}` : formatFcfa(q.fee));

// Ce que le site public reçoit pour la page Valider. Heures de nuit réglées : supplément de chaque
// quartier, heures, et « c'est la nuit maintenant ». Réglage éteint : rien de plus, comme avant.
export const publicGrid = (grid, now = new Date()) => ({
  active: !grid.isEmpty,
  zones: grid.zones.map((z) => ({ id: z.id, name: z.name, fee: z.fee, ...(grid.night && { nightFee: z.nightFee ?? 0 }) })),
  gps: grid.bands.length > 0,
  allowOther: grid.allowOther,
  ...(grid.night && {
    night: { from: minutesToHHMM(grid.night.startMin), to: minutesToHHMM(grid.night.endMin), isNight: isNightTime(grid.night, now) },
  }),
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
        ...(quote.nightFee ? { deliveryNightFee: quote.nightFee } : {}),
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

// null si permis, sinon le message. amount : nouveau montant (au moins 1 F quand l'équipe le saisit).
// nightFee (lot 3) : supplément de nuit après la correction ; même total avec un autre supplément = correction.
export function feeCorrectionError(order, role, amount, reason, nightFee = order.deliveryNightFee ?? null) {
  const right = feeEditRight(order);
  if (!right.who) return right.error;
  if (right.who === 'PATRON' && !isPatronLevel(role)) return 'Le livreur est parti : seul le Patron peut encore corriger les frais.';
  if (order.deliveryFee != null && (!reason || reason.trim().length < 3)) return 'Indiquez le motif de la correction des frais.';
  if (order.deliveryFee === amount && (order.deliveryNightFee ?? null) === nightFee) return 'Les frais sont déjà de ce montant.';
  return null;
}

// Supplément de nuit après une saisie ou une correction des frais par l'équipe (amount = nouveau total).
// nightFee donné (champ « dont supplément de nuit ») : celui-là ; 0 ou null = aucun ; jamais plus que le total.
// Non donné : celui de la commande est gardé, ramené au nouveau total s'il le dépasse.
// Renvoie { nightFee } (null = aucun) ou { error }.
export function nightFeeAfter(order, amount, nightFee) {
  if (nightFee === undefined) {
    const kept = order.deliveryNightFee ?? null;
    return { nightFee: kept == null || amount == null ? kept : Math.min(kept, amount) || null };
  }
  if (nightFee == null || nightFee === 0) return { nightFee: null };
  if (amount == null || nightFee > amount) return { error: 'Le supplément de nuit ne peut pas dépasser les frais de livraison.' };
  return { nightFee };
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
  nightFee: fee.optional(), // supplément de nuit (0 F par défaut, en base)
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
  nightFee: fee.optional(), // supplément de nuit (0 F par défaut, en base)
  isActive: z.boolean().default(true),
});
export const bandUpdateSchema = bandSchema.partial();

const hhmm = z
  .string({ invalid_type_error: 'Indiquez l’heure (ex. 22:00).' })
  .regex(HHMM, 'Indiquez l’heure au format 22:00.')
  .transform(hhmmToMinutes);

// Réglages de la grille : chaque champ est facultatif (seulement ce qui change)
export const settingsSchema = z
  .object({
    allowOtherZone: z.boolean().optional(),
    // Lot 3 : heures de nuit (« 22:00 », enregistrées en minutes)
    nightEnabled: z.boolean().optional(),
    nightStart: hhmm.optional(),
    nightEnd: hhmm.optional(),
  })
  .refine((v) => v.nightStart == null || v.nightEnd == null || v.nightStart !== v.nightEnd, {
    message: 'Le début et la fin de la nuit doivent être différents.',
    path: ['nightEnd'],
  });

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
