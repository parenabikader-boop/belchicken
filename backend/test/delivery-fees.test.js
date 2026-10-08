import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeGrid, bandFor, bandRanges, bandSchema, distanceMeters, expectedFeeError, feeCorrectionError, feeEditRight, orderFeeFields,
  publicGrid, quoteDelivery, sameZoneName, zoneSchema,
} from '../src/services/delivery-fees.js';
import { feeMethodError, feeToCollect, paymentConfirmError } from '../src/services/order-status.js';
import { feeSentence, messageModel, renderMessage } from '../src/services/customer-messages.js';

const RESTO = { latitude: 12.352187, longitude: -1.519188 };
// Environ 1 km de latitude = 1/111 de degré : un point à `km` au nord du restaurant
const north = (km, accuracy) => ({ latitude: RESTO.latitude + km / 111.2, longitude: RESTO.longitude, ...(accuracy != null ? { accuracy } : {}) });

const zone = (id, name, fee, extra = {}) => ({ id, name, fee, position: 0, isActive: true, ...extra });
const band = (id, upToMeters, fee, extra = {}) => ({ id, upToMeters, fee, isActive: true, ...extra });
const grid = (over = {}) =>
  activeGrid({
    zones: [zone('z1', 'Kamsonghin', 500, { position: 1 }), zone('z2', 'Ouaga 2000', 1500, { position: 0 }), zone('z3', 'Ancien', 900, { isActive: false })],
    bands: [band('b2', 6000, 1000), band('b1', 3000, 0), band('b3', 10000, 2000, { isActive: false })],
    settings: { allowOtherZone: true },
    ...over,
  });
const quote = (g, choice) => quoteDelivery(g, choice, RESTO);

test('distance à vol d’oiseau depuis le restaurant', () => {
  assert.equal(distanceMeters(RESTO, RESTO), 0);
  const d = distanceMeters(RESTO, north(5));
  assert.ok(Math.abs(d - 5000) < 30, `environ 5 km, trouvé ${d} m`);
});

test('grille : seulement les quartiers et tranches actifs, dans l’ordre', () => {
  const g = grid();
  assert.deepEqual(g.zones.map((z) => z.name), ['Ouaga 2000', 'Kamsonghin']);
  assert.deepEqual(g.bands.map((b) => b.upToMeters), [3000, 6000]);
  assert.deepEqual(bandRanges(g.bands).map((b) => [b.fromMeters, b.upToMeters]), [[0, 3000], [3000, 6000]]);
  assert.equal(bandFor(g.bands, 3000).id, 'b1'); // limite comprise dans la tranche
  assert.equal(bandFor(g.bands, 3001).id, 'b2');
  assert.equal(bandFor(g.bands, 6001), null);
  assert.deepEqual(publicGrid(g), {
    active: true,
    zones: [{ id: 'z2', name: 'Ouaga 2000', fee: 1500 }, { id: 'z1', name: 'Kamsonghin', fee: 500 }],
    gps: true,
    allowOther: true,
  });
});

test('grille vide : rien ne change, l’équipe saisit les frais comme avant', () => {
  const empty = activeGrid({ zones: [zone('z', 'Vieux', 500, { isActive: false })], bands: [], settings: null });
  assert.equal(empty.isEmpty, true);
  assert.equal(publicGrid(empty).active, false);
  const q = quote(empty, { zoneId: 'z' });
  assert.equal(q.source, null);
  assert.deepEqual(orderFeeFields(q), {}); // aucun champ de frais à la commande
});

test('quartier choisi : son prix, et il passe avant la position', () => {
  assert.deepEqual(quote(grid(), { zoneId: 'z2', location: north(1) }), { source: 'QUARTIER', fee: 1500, zoneId: 'z2', zoneName: 'Ouaga 2000', distanceM: null });
  assert.match(quote(grid(), { zoneId: 'z3' }).error, /plus proposé/); // désactivé
  assert.match(quote(grid(), { zoneId: 'inconnu' }).error, /plus proposé/);
});

test('position GPS : tranche de distance, 0 F = livraison offerte', () => {
  const near = quote(grid(), { location: north(2) });
  assert.equal(near.source, 'DISTANCE');
  assert.equal(near.fee, 0);
  assert.ok(near.distanceM > 1900 && near.distanceM < 2100);
  assert.equal(quote(grid(), { location: north(4.5) }).fee, 1000);
});

test('au-delà de la dernière tranche, ou position imprécise : à confirmer par l’agent', () => {
  const far = quote(grid(), { location: north(8) });
  assert.equal(far.source, 'A_CONFIRMER');
  assert.equal(far.fee, null);
  assert.ok(far.distanceM > 7900);
  assert.equal(quote(grid(), { location: north(1, 1500) }).source, 'A_CONFIRMER');
  assert.equal(quote(grid(), { location: north(1, 800) }).source, 'DISTANCE');
});

test('autre quartier : à confirmer, seulement si le Patron le propose', () => {
  assert.equal(quote(grid(), { other: true }).source, 'A_CONFIRMER');
  const closed = grid({ settings: { allowOtherZone: false } });
  assert.match(quote(closed, { other: true }).error, /Choisissez votre quartier/);
});

test('un choix est obligatoire quand la grille est remplie', () => {
  assert.match(quote(grid(), {}).error, /quartier ou partagez votre position/);
  const zonesOnly = grid({ bands: [] });
  assert.match(quote(zonesOnly, {}).error, /^Choisissez votre quartier\.$/);
  // Position sans tranche réglée : à confirmer si « Autre quartier » est proposé, sinon le quartier est demandé
  assert.equal(quote(zonesOnly, { location: north(1) }).source, 'A_CONFIRMER');
  assert.match(quote(grid({ bands: [], settings: { allowOtherZone: false } }), { location: north(1) }).error, /quartier/);
  // Ancienne version du site, qui n'envoie aucun choix : l'agent fixe les frais
  assert.equal(quote(grid({ settings: { allowOtherZone: false } }), { legacy: true }).source, 'A_CONFIRMER');
});

test('montant affiché au client : refusé s’il a changé entre-temps', () => {
  const q = { source: 'QUARTIER', fee: 1500 };
  assert.equal(expectedFeeError(q, undefined), null); // ancienne version du site
  assert.equal(expectedFeeError(q, 1500), null);
  assert.match(expectedFeeError(q, 1000), /ont changé : 1 500 F/);
  assert.match(expectedFeeError({ fee: 0 }, 500), /livraison offerte/);
  assert.match(expectedFeeError({ fee: null }, 500), /confirmés par notre équipe/);
});

test('frais figés dans la commande : montant, quartier, distance, origine', () => {
  assert.deepEqual(orderFeeFields(quote(grid(), { zoneId: 'z1' })), {
    deliveryFee: 500, deliveryFeeSource: 'QUARTIER', deliveryZoneId: 'z1', deliveryZoneName: 'Kamsonghin', deliveryDistanceM: null,
  });
  assert.equal(orderFeeFields(quote(grid(), { other: true })).deliveryFee, null);
});

const order = (extra = {}) => ({ mode: 'LIVRAISON', status: 'PAYEE', deliveryFee: 1000, deliveryFeeMethod: null, deliveryFeeVerifiedAt: null, cashRemittanceId: null, ...extra });

test('correction des frais : motif obligatoire, le Patron seul après le départ du livreur', () => {
  // Première saisie (à confirmer) : sans motif
  assert.equal(feeCorrectionError(order({ deliveryFee: null }), 'OPERATEUR', 1000, ''), null);
  assert.match(feeCorrectionError(order(), 'OPERATEUR', 1500, ''), /motif/);
  assert.equal(feeCorrectionError(order(), 'OPERATEUR', 1500, 'Client plus loin'), null);
  assert.match(feeCorrectionError(order(), 'PATRON', 1000, 'Même prix'), /déjà de ce montant/);
  // Livreur parti
  const route = order({ status: 'EN_LIVRAISON' });
  assert.match(feeCorrectionError(route, 'OPERATEUR', 1500, 'Erreur de quartier'), /seul le Patron/);
  assert.equal(feeCorrectionError(route, 'PATRON', 1500, 'Erreur de quartier'), null);
  assert.match(feeCorrectionError(route, 'PATRON', 1500, ''), /motif/);
  // Livrée : tant que les frais ne sont ni vérifiés ni remis
  assert.equal(feeEditRight(order({ status: 'LIVREE', deliveryFeeMethod: 'ESPECES' })).who, 'PATRON');
  assert.match(feeEditRight(order({ status: 'LIVREE', deliveryFeeMethod: 'ESPECES', cashRemittanceId: 'r1' })).error, /remis/);
  assert.match(feeEditRight(order({ status: 'LIVREE', deliveryFeeMethod: 'MOBILE_MONEY', deliveryFeeVerifiedAt: new Date() })).error, /vérifiés/);
  assert.match(feeEditRight(order({ status: 'LIVREE', deliveryFee: 0 })).error, /sans frais encaissés/);
  assert.equal(feeEditRight(order({ status: 'ANNULEE' })).who, null);
  assert.equal(feeEditRight(order({ mode: 'A_EMPORTER' })).who, null);
});

test('livraison offerte : rien à encaisser, pas de mode de paiement demandé au livreur', () => {
  const free = order({ status: 'EN_LIVRAISON', deliveryFee: 0 });
  assert.equal(feeToCollect(free), false);
  assert.equal(feeMethodError(free, undefined), null);
  assert.equal(feeToCollect(order({ status: 'EN_LIVRAISON' })), true);
  // L'agent qui confirme le paiement garde les frais de la grille, même 0 F ; un montant tapé est d'au moins 1 F
  assert.equal(paymentConfirmError(0, 'LIVRAISON', 0), null);
  assert.match(paymentConfirmError(0, 'LIVRAISON', null), /invalides/);
});

test('livraison offerte : messages sans montant ni codes marchands', () => {
  const ctx = { siteUrl: 'https://site', payment: { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*MONTANT#', MOOV_MONEY: '*2*MONTANT#', TELECEL_MONEY: '*3*MONTANT#' } } };
  const o = { customerName: 'Awa', reference: 'BC-ABC123', itemsTotal: 5500, deliveryFee: 0, deliveryCode: '1234', status: 'EN_LIVRAISON', mode: 'LIVRAISON' };
  for (const key of ['PAIEMENT_CONFIRME', 'EN_PREPARATION', 'EN_ROUTE']) {
    const text = renderMessage(key, o, ctx);
    assert.match(text, /Livraison offerte : vous n’avez rien à payer au livreur\./, key);
    assert.doesNotMatch(text, /code marchand|\*1\*/, key);
    assert.doesNotMatch(text, /\{\{\d+\}\}/, `${key} : toutes les variables remplies`);
    assert.match(messageModel(key, o).template, /_offerte$/);
  }
  assert.match(renderMessage('EN_ROUTE', o, ctx), /1234/);
  assert.equal(feeSentence(o, ctx), 'Livraison offerte : vous n’avez rien à payer au livreur.');
  assert.match(feeSentence({ ...o, deliveryFee: 1000 }, ctx), /1 000 F, à payer au livreur/);
});

test('page du Patron : prix de 0 à 50 000 F, distances en km, noms sans doublon', () => {
  assert.equal(zoneSchema.parse({ name: '  Gounghin ', fee: 0 }).name, 'Gounghin');
  assert.throws(() => zoneSchema.parse({ name: 'Gounghin', fee: -1 }), /négatif/);
  assert.throws(() => zoneSchema.parse({ name: 'G', fee: 500 }), /nom du quartier/);
  assert.equal(bandSchema.parse({ upToKm: 2.5, fee: 500 }).upToKm, 2500);
  assert.equal(bandSchema.parse({ upToKm: 3.04, fee: 500 }).upToKm, 3000);
  assert.throws(() => bandSchema.parse({ upToKm: 0, fee: 500 }), /0,1 km/);
  assert.equal(sameZoneName('Ouaga  2000', 'ouaga 2000'), true);
  assert.equal(sameZoneName('Gounghin', 'Gounghín'), true);
  assert.equal(sameZoneName('Gounghin', 'Gounghin Nord'), false);
});
