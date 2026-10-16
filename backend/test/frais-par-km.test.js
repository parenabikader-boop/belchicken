// Plan 3, frais de livraison par kilomètre avant le paiement (interrupteur FRAIS_PAR_KM, fermé sans ligne). Sans base
// de données ni vrai réseau (OpenRouteService est remplacé par une fausse réponse). Fermé : comme avant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEES_BY_KM, featureMap } from '../src/services/features.js';
import {
  ESTIMATE_FACTOR, estimatedRoad, IMPRECISE, kmActive, kmChoiceError, kmExamples, kmFee, kmGridSchema, kmLockError, kmQuote, KM_LOCKED,
  lockedEditRight, OTHER_OFF, parseOrsDistance, publicGridWith, quoteWith, staffKm,
} from '../src/services/delivery-km.js';
import { activeGrid, distanceMeters, MAX_ACCURACY_METERS, orderFeeFields, publicGrid, quoteDelivery } from '../src/services/delivery-fees.js';
import { publicQuote } from '../src/services/delivery-fees.service.js';
import { cacheKey, clearRouteCache, ORS_URL, roadDistance } from '../src/services/route-distance.service.js';

const RESTAURANT = { latitude: 12.352187, longitude: -1.519188 };
const CLIENT = { latitude: 12.37, longitude: -1.53, accuracy: 30 };
const KM = { enabled: true, baseFee: 500, perKmFee: 200, roundTo: 100, minFee: 500, maxFee: 3000, maxKm: 15 };
const NOW = new Date('2026-10-16T12:00:00Z'); // de jour
const zone = (id, name, fee, extra = {}) => ({ id, name, fee, nightFee: 0, isActive: true, position: 0, ...extra });
const band = (id, upToMeters, fee) => ({ id, upToMeters, fee, nightFee: 0, isActive: true });
const GRID = activeGrid({ zones: [zone('z1', 'Gounghin', 1000), zone('z2', 'Ouaga 2000', 1500)], bands: [band('b1', 3000, 750), band('b2', 8000, 1250)], settings: null });
const EMPTY = activeGrid({ zones: [], bands: [], settings: null });
const noRoad = async () => assert.fail('la distance par la route ne doit pas être demandée');

test('interrupteur FRAIS_PAR_KM : fermé sans ligne ; grille active seulement si ouvert ET allumée par le Patron', () => {
  assert.equal(FEES_BY_KM, 'FRAIS_PAR_KM');
  assert.equal(featureMap([])[FEES_BY_KM], false);
  assert.equal(kmActive(false, { enabled: true }), false);
  assert.equal(kmActive(true, { enabled: false }), false);
  assert.equal(kmActive(true, null), false);
  assert.equal(kmActive(true, { enabled: true }), true);
});

test('fermé : les frais sont exactement ceux d’avant, sans jamais demander une distance par la route', async () => {
  const cases = [
    { choice: { zoneId: 'z1' } },
    { choice: { other: true } },
    { choice: {}, location: CLIENT },
    { choice: {}, location: { ...CLIENT, accuracy: 2000 } },
    { choice: {}, legacy: true },
    { choice: {} },
  ];
  for (const grid of [GRID, EMPTY]) {
    for (const c of cases) {
      const before = quoteDelivery(grid, { ...c.choice, location: c.location, legacy: c.legacy }, RESTAURANT, NOW);
      const now = await quoteWith({ grid, km: null, ...c, restaurant: RESTAURANT, now: NOW, maxAccuracy: MAX_ACCURACY_METERS }, noRoad);
      assert.deepEqual(now, before, JSON.stringify(c));
      assert.equal('kmMode' in now, false);
    }
  }
  // Grille publique et aperçu : ceux d'avant
  assert.deepEqual(publicGridWith(publicGrid(GRID, NOW), null), publicGrid(GRID, NOW));
  const q = quoteDelivery(GRID, { location: CLIENT }, RESTAURANT, NOW);
  assert.deepEqual(Object.keys(publicQuote(q)).sort(), ['distanceKm', 'fee', 'source', 'zoneName']);
});

test('grille par km : prix de départ + prix par km, arrondi au-dessus, entre le minimum et le maximum', () => {
  assert.deepEqual(kmFee(KM, 2300), { fee: 1000 }); // 500 + 460 = 960 -> 1 000
  assert.deepEqual(kmFee(KM, 2500), { fee: 1000 }); // 1 000 tout rond : pas d'arrondi en plus
  assert.deepEqual(kmFee(KM, 0), { fee: 500 });
  assert.deepEqual(kmFee({ ...KM, minFee: 800 }, 500), { fee: 800 }); // minimum
  assert.deepEqual(kmFee(KM, 14000), { fee: 3000 }); // 3 300 -> maximum 3 000
  assert.deepEqual(kmFee({ ...KM, roundTo: 50 }, 2150), { fee: 950 }); // 930 -> 950
  assert.match(kmFee(KM, 15100).error, /Trop loin.*15 km.*15,1 km/);
  assert.deepEqual(kmFee({ ...KM, maxKm: null }, 40000), { fee: 3000 }); // pas de limite de distance
  assert.deepEqual(kmExamples(KM).map((e) => [e.km, e.fee]), [[2, 900], [5, 1500], [10, 2500]]);
});

test('choix du client avec la grille par km : quartier ou position ; « Autre quartier » et position imprécise refusés', () => {
  assert.equal(kmChoiceError({ zoneId: 'z1' }, MAX_ACCURACY_METERS), null);
  assert.equal(kmChoiceError({ zoneId: 'z1', location: { ...CLIENT, accuracy: 5000 } }, MAX_ACCURACY_METERS), null); // le quartier passe avant
  assert.equal(kmChoiceError({ other: true }, MAX_ACCURACY_METERS), OTHER_OFF);
  assert.equal(kmChoiceError({}, MAX_ACCURACY_METERS), OTHER_OFF);
  assert.equal(kmChoiceError({ location: { ...CLIENT, accuracy: 1500 } }, MAX_ACCURACY_METERS), IMPRECISE);
  assert.equal(kmChoiceError({ location: CLIENT }, MAX_ACCURACY_METERS), null);
});

test('devis avec la grille par km : distance par la route, sinon estimation ; montant figé sur la commande', async () => {
  const opts = { grid: GRID, km: KM, restaurant: RESTAURANT, now: NOW, maxAccuracy: MAX_ACCURACY_METERS };
  const route = await quoteWith({ ...opts, location: CLIENT }, async () => ({ meters: 4200, estimated: false }));
  assert.deepEqual(route, { source: 'KM_ROUTE', fee: 1400, zoneId: null, zoneName: null, distanceM: 4200, km: true, kmMode: true });
  assert.deepEqual(orderFeeFields(route), { deliveryFee: 1400, deliveryFeeSource: 'KM_ROUTE', deliveryZoneId: null, deliveryZoneName: null, deliveryDistanceM: 4200 });
  const estimate = await quoteWith({ ...opts, location: CLIENT }, async () => ({ meters: 4200, estimated: true }));
  assert.equal(estimate.source, 'KM_ESTIMATION');
  assert.deepEqual(publicQuote(estimate), { source: 'KM_ESTIMATION', fee: 1400, zoneName: null, distanceKm: 4.2, kmMode: true, estimate: true });
  // Quartier choisi : son prix, sans distance par la route
  const byZone = await quoteWith({ ...opts, choice: { zoneId: 'z2' }, location: CLIENT }, noRoad);
  assert.equal(byZone.fee, 1500);
  assert.equal(byZone.source, 'QUARTIER');
  assert.equal(byZone.kmMode, true);
  // Refus, sans distance demandée
  assert.equal((await quoteWith({ ...opts, choice: { other: true } }, noRoad)).error, OTHER_OFF);
  assert.match((await quoteWith({ ...opts, location: CLIENT }, async () => ({ meters: 20000, estimated: false }))).error, /Trop loin/);
  // Ancienne version du site (aucun choix envoyé) : comme avant
  assert.deepEqual(await quoteWith({ ...opts, legacy: true }, noRoad), quoteDelivery(GRID, { legacy: true }, RESTAURANT, NOW));
});

test('grille publique avec la grille par km : position par la route, jamais « Autre quartier »', () => {
  const pub = publicGridWith(publicGrid(EMPTY, NOW), KM);
  assert.equal(pub.active, true);
  assert.equal(pub.gps, true);
  assert.equal(pub.allowOther, false);
  assert.deepEqual(pub.km, { maxKm: 15 });
  assert.equal(JSON.stringify(pub).includes('perKmFee'), false); // le détail des prix reste chez le Patron
});

test('estimation sans le service : vol d’oiseau × 1,3', () => {
  assert.equal(ESTIMATE_FACTOR, 1.3);
  assert.deepEqual(estimatedRoad(1000), { meters: 1300, estimated: true });
  assert.equal(parseOrsDistance({ routes: [{ summary: { distance: 4231.6, duration: 600 } }] }), 4232);
  for (const bad of [null, {}, { routes: [] }, { routes: [{ summary: { distance: 0 } }] }, { routes: [{ summary: { distance: 'x' } }] }]) assert.equal(parseOrsDistance(bad), null);
});

test('OpenRouteService : clé dans l’en-tête (jamais dans l’adresse), réponse gardée, repli sur l’estimation', async () => {
  clearRouteCache();
  const calls = [];
  const ok = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ routes: [{ summary: { distance: 5100 } }] }) };
  };
  assert.deepEqual(await roadDistance(RESTAURANT, CLIENT, { fetchImpl: ok, key: 'CLE-SECRETE', now: 0 }), { meters: 5100, estimated: false });
  assert.equal(calls[0].url, ORS_URL);
  assert.equal(calls[0].url.includes('CLE-SECRETE'), false);
  assert.equal(calls[0].init.headers.Authorization, 'CLE-SECRETE');
  assert.deepEqual(JSON.parse(calls[0].init.body).coordinates, [[RESTAURANT.longitude, RESTAURANT.latitude], [CLIENT.longitude, CLIENT.latitude]]);
  // Même endroit (à 10 m près) : la réponse gardée, sans nouvel appel (même montant à la commande)
  await roadDistance(RESTAURANT, { ...CLIENT, latitude: CLIENT.latitude + 0.00001 }, { fetchImpl: ok, key: 'CLE-SECRETE', now: 1000 });
  assert.equal(calls.length, 1);
  assert.equal(cacheKey(CLIENT), '12.3700,-1.5300');

  const straight = distanceMeters(RESTAURANT, CLIENT);
  clearRouteCache();
  const down = async () => { throw new Error('réseau coupé'); };
  assert.deepEqual(await roadDistance(RESTAURANT, CLIENT, { fetchImpl: down, key: 'K', now: 0 }), estimatedRoad(straight));
  clearRouteCache();
  const refused = async () => ({ ok: false, status: 403, json: async () => ({}) });
  assert.equal((await roadDistance(RESTAURANT, CLIENT, { fetchImpl: refused, key: 'K', now: 0 })).estimated, true);
  clearRouteCache();
  let called = false;
  const spy = async () => { called = true; };
  assert.equal((await roadDistance(RESTAURANT, CLIENT, { fetchImpl: spy, key: '', now: 0 })).estimated, true); // pas de clé
  assert.equal(called, false);
  clearRouteCache();
});

test('réglages du Patron : vérifiés (arrondi 50 ou 100 F, minimum ≤ maximum, montants entiers)', () => {
  assert.equal(kmGridSchema.safeParse(KM).success, true);
  assert.equal(kmGridSchema.safeParse({ ...KM, maxKm: null }).success, true);
  assert.equal(kmGridSchema.safeParse({ ...KM, roundTo: 75 }).success, false);
  assert.equal(kmGridSchema.safeParse({ ...KM, minFee: 4000 }).success, false);
  assert.equal(kmGridSchema.safeParse({ ...KM, perKmFee: 12.5 }).success, false);
  assert.equal(kmGridSchema.safeParse({ ...KM, baseFee: -1 }).success, false);
  assert.equal(kmGridSchema.safeParse({ ...KM, maxKm: 0.1 }).success, false);
  const page = staffKm(null); // jamais réglée
  assert.equal(page.enabled, false);
  assert.equal(page.roundTo, 100);
  assert.equal(page.examples.length, 3);
});

test('call center : plus de correction des frais calculés quand la grille par km est active (le Patron, si)', () => {
  const o = { deliveryFee: 1400 };
  assert.equal(kmLockError(o, 'OPERATEUR', 2000), KM_LOCKED);
  assert.equal(kmLockError(o, 'OPERATEUR', 1400), null); // même montant : rien ne change
  assert.equal(kmLockError(o, 'PATRON', 2000), null);
  assert.equal(kmLockError(o, 'PRESTATAIRE', 2000), null);
  assert.equal(kmLockError({ deliveryFee: null }, 'OPERATEUR', 1000), null); // première saisie (ancienne commande)
  assert.equal(lockedEditRight('TOUS', o), 'PATRON');
  assert.equal(lockedEditRight('TOUS', { deliveryFee: null }), 'TOUS');
  assert.equal(lockedEditRight('PATRON', o), 'PATRON');
  assert.equal(lockedEditRight(null, o), null);
});
