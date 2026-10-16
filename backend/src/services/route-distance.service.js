// Plan 3 : distance PAR LA ROUTE entre le restaurant et le client, avec OpenRouteService (clé OPENROUTESERVICE_API_KEY,
// variable Render). Clé absente, service injoignable (4 s au plus) ou réponse illisible : vol d'oiseau × 1,3, notée
// « estimation » (règles dans delivery-km.js). Les réponses sont gardées en mémoire, pour que le montant accepté par
// le client soit le même à la commande : 6 h pour une distance par la route, 10 min pour une estimation.
import { env } from '../config/env.js';
import { distanceMeters } from './delivery-fees.js';
import { estimatedRoad, parseOrsDistance } from './delivery-km.js';

export const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
const TIMEOUT_MS = 4000;
const ROUTE_TTL = 6 * 60 * 60 * 1000;
const ESTIMATE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 1000;

const cache = new Map();
// Position arrondie à 4 décimales (une dizaine de mètres) : deux demandes au même endroit ont la même distance
export const cacheKey = (p) => `${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`;

export function clearRouteCache() {
  cache.clear();
}

// { meters, estimated } ; ne lève jamais d'erreur. fetchImpl et key : pour les tests (jamais de vrai réseau).
export async function roadDistance(from, to, { fetchImpl = globalThis.fetch, key = env.openRouteServiceKey, now = Date.now() } = {}) {
  const id = `${cacheKey(from)}>${cacheKey(to)}`;
  const hit = cache.get(id);
  if (hit && hit.until > now) return hit.value;

  let value = null;
  if (key && fetchImpl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(ORS_URL, {
        method: 'POST',
        headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }),
        signal: controller.signal,
      });
      const meters = res.ok ? parseOrsDistance(await res.json()) : null;
      if (meters != null) value = { meters, estimated: false };
      else console.error(`[distance] OpenRouteService : réponse ${res.status} inutilisable, estimation à la place`);
    } catch (e) {
      console.error(`[distance] OpenRouteService injoignable (${e.name === 'AbortError' ? 'délai dépassé' : e.message}), estimation à la place`);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!value) value = estimatedRoad(distanceMeters(from, to));

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(id, { value, until: now + (value.estimated ? ESTIMATE_TTL : ROUTE_TTL) });
  return value;
}
