// Plan 3, frais de livraison par kilomètre, calculés AVANT le paiement du repas (interrupteur FRAIS_PAR_KM, fermé sans
// ligne). Règles sans base de données, testées dans test/frais-par-km.test.js. Accès à la base et au service de
// distance : delivery-fees.service.js et route-distance.service.js.
//
// - Grille du Patron de Belchicken (DeliveryKmGrid) : prix de départ + prix par km × distance par la route, arrondi
//   au-dessus (50 ou 100 F), entre un minimum et un maximum ; au-delà de la distance maximale, pas de livraison.
// - Active seulement si l'interrupteur est ouvert ET que le Patron l'a allumée. Sinon : la grille d'avant.
// - Le quartier choisi passe avant la position (prix du quartier, comme avant) ; « Autre quartier » est refusé.
// - Le montant est figé sur la commande ; le client l'accepte avant de payer (le site renvoie le montant vu, que le
//   serveur compare : jamais un prix venu du site).
import { z } from 'zod';
import { formatFcfa } from '../utils/format.js';
import { isPatronLevel } from './roles.js';
import { quoteDelivery } from './delivery-fees.js';

export const ESTIMATE_FACTOR = 1.3; // service de distance injoignable : vol d'oiseau × 1,3
export const ROUND_STEPS = [50, 100];
export const FEE_LIMIT = 50000;

const fee = (label) =>
  z.number({ required_error: `Indiquez ${label}.`, invalid_type_error: `Indiquez ${label}.` })
    .int(`${label[0].toUpperCase()}${label.slice(1)} : un nombre entier de francs.`)
    .min(0, `${label[0].toUpperCase()}${label.slice(1)} ne peut pas être négatif.`)
    .max(FEE_LIMIT, `${label[0].toUpperCase()}${label.slice(1)} : ${formatFcfa(FEE_LIMIT)} au plus.`);

// Réglages du Patron (page Frais de livraison)
export const kmGridSchema = z
  .object({
    enabled: z.boolean(),
    baseFee: fee('le prix de départ'),
    perKmFee: fee('le prix par km').refine((v) => v <= 20000, 'Le prix par km : 20 000 F au plus.'),
    roundTo: z.union([z.literal(50), z.literal(100)], { errorMap: () => ({ message: 'Arrondi : 50 F ou 100 F.' }) }),
    minFee: fee('le minimum'),
    maxFee: fee('le maximum'),
    maxKm: z.number({ invalid_type_error: 'Distance maximale : un nombre de km.' }).min(0.5, 'Distance maximale : au moins 0,5 km.').max(100, 'Distance maximale : 100 km au plus.').nullable().optional(),
  })
  .refine((g) => g.minFee <= g.maxFee, { message: 'Le minimum ne peut pas dépasser le maximum.', path: ['maxFee'] });

// « 2,3 km »
export const kmText = (km) => `${(Math.round(km * 10) / 10).toLocaleString('fr-FR')} km`;

// Frais pour une distance par la route (meters). { fee } ou { error } (trop loin).
export function kmFee(grid, meters) {
  const km = meters / 1000;
  if (grid.maxKm != null && km > grid.maxKm) {
    return { error: `Trop loin pour une livraison : nous livrons jusqu’à ${kmText(grid.maxKm)} du restaurant par la route (vous êtes à ${kmText(km)}). Choisissez votre quartier dans la liste, ou venez retirer votre commande.` };
  }
  const raw = grid.baseFee + grid.perKmFee * km;
  const rounded = Math.ceil(raw / grid.roundTo - 1e-9) * grid.roundTo;
  return { fee: Math.min(grid.maxFee, Math.max(grid.minFee, rounded)) };
}

// Exemples pour la page du Patron (2, 5 et 10 km)
export const kmExamples = (grid, kms = [2, 5, 10]) => kms.map((km) => ({ km, ...kmFee(grid, km * 1000) }));

// La grille est-elle active pour les clients ? Interrupteur ouvert et grille allumée par le Patron
export const kmActive = (switchOpen, row) => Boolean(switchOpen && row?.enabled);

export const OTHER_OFF = 'Choisissez votre quartier dans la liste, ou partagez votre position pour connaître vos frais de livraison.';
export const IMPRECISE = 'Votre position est trop imprécise pour calculer les frais : réessayez (dehors, GPS allumé) ou choisissez votre quartier dans la liste.';
export const NEED_ACCEPT = 'Acceptez d’abord les frais de livraison, puis payez votre repas.';

// Avant le calcul : ce qui est refusé dans la grille par km (null si le choix convient)
// choice : { zoneId, other, location } ; maxAccuracy : précision GPS au-delà de laquelle la position ne sert pas
export function kmChoiceError({ zoneId, other, location } = {}, maxAccuracy) {
  if (zoneId) return null; // prix du quartier, comme avant
  if (other) return OTHER_OFF;
  if (!location) return OTHER_OFF;
  if (location.accuracy != null && location.accuracy > maxAccuracy) return IMPRECISE;
  return null;
}

// Devis par km, une fois la distance connue (road : { meters, estimated })
export function kmQuote(grid, road) {
  const result = kmFee(grid, road.meters);
  if (result.error) return { error: result.error };
  return { source: road.estimated ? 'KM_ESTIMATION' : 'KM_ROUTE', fee: result.fee, zoneId: null, zoneName: null, distanceM: road.meters, km: true };
}

// Distance estimée sans le service : vol d'oiseau × 1,3, arrondie au mètre
export const estimatedRoad = (straightMeters) => ({ meters: Math.round(straightMeters * ESTIMATE_FACTOR), estimated: true });

// Réponse d'OpenRouteService (POST /v2/directions/driving-car) -> mètres, ou null si illisible
export function parseOrsDistance(json) {
  const meters = Number(json?.routes?.[0]?.summary?.distance);
  return Number.isFinite(meters) && meters > 0 ? Math.round(meters) : null;
}

// Ce que le site public reçoit en plus de la grille quand elle est active (rien sinon)
export const publicKm = (grid) => ({ maxKm: grid.maxKm ?? null });

// Ce que la page du Patron reçoit (réglages et exemples)
export const staffKm = (row) => {
  const grid = {
    enabled: row?.enabled ?? false,
    baseFee: row?.baseFee ?? 0,
    perKmFee: row?.perKmFee ?? 0,
    roundTo: row?.roundTo ?? 100,
    minFee: row?.minFee ?? 0,
    maxFee: row?.maxFee ?? FEE_LIMIT,
    maxKm: row?.maxKm ?? null,
  };
  return { ...grid, examples: kmExamples(grid), updatedByName: row?.updatedByName ?? null, updatedAt: row?.updatedAt ?? null, estimateFactor: ESTIMATE_FACTOR };
};

// Le call center ne corrige plus des frais déjà calculés quand la grille par km est active (le Patron, si)
export const KM_LOCKED = 'Frais calculés par le site et acceptés par le client : le call center ne les modifie plus. Le Patron peut encore les corriger, avec un motif.';

// Call center : une correction de frais déjà calculés est refusée (le Patron, lui, garde son droit, avec un motif).
// newFee : montant demandé ; order.deliveryFee vide (première saisie, ancienne commande) : rien ne change.
export function kmLockError(order, role, newFee) {
  if (order.deliveryFee == null || newFee === order.deliveryFee) return null;
  return isPatronLevel(role) ? null : KM_LOCKED;
}

// Qui peut encore corriger : 'TOUS' devient 'PATRON' pour des frais déjà calculés
export const lockedEditRight = (who, order) => (who === 'TOUS' && order.deliveryFee != null ? 'PATRON' : who);

// Devis complet, sans base (testé) : grille par km active (km) ou grille d'avant (km = null : exactement comme
// avant). road : fonction asynchrone qui donne la distance par la route ({ meters, estimated }), appelée
// seulement quand il faut une distance. Renvoie un devis ou { error }.
export async function quoteWith({ grid, km, choice = {}, location, legacy = false, restaurant, now = new Date(), maxAccuracy }, road) {
  if (!km || legacy) return quoteDelivery(grid, { ...choice, location, legacy }, restaurant, now);
  const refused = kmChoiceError({ ...choice, location }, maxAccuracy);
  if (refused) return { error: refused };
  const quote = choice.zoneId ? quoteDelivery(grid, { zoneId: choice.zoneId }, restaurant, now) : kmQuote(km, await road(restaurant, location));
  return quote.error ? quote : { ...quote, kmMode: true };
}

// Grille publique du site : celle d'avant, ou la même avec la grille par km active (sans « Autre quartier »)
export const publicGridWith = (pub, km) => (km ? { ...pub, active: true, gps: true, allowOther: false, km: publicKm(km) } : pub);
