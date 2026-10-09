// Lot 3 : supplément de nuit dans la grille des frais de livraison
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeGrid, bandSchema, expectedFeeError, feeCorrectionError, feeWithNight, isNightTime, nightFeeAfter, nightHours, orderFeeFields,
  publicGrid, quoteDelivery, settingsSchema, zoneSchema,
} from '../src/services/delivery-fees.js';
import { feeSentence, messageModel, renderMessage } from '../src/services/customer-messages.js';

const RESTO = { latitude: 12.352187, longitude: -1.519188 };
const north = (km) => ({ latitude: RESTO.latitude + km / 111.2, longitude: RESTO.longitude });
// Heure du Burkina = UTC
const at = (hh, mm = 0) => new Date(Date.UTC(2026, 9, 9, hh, mm));
const NIGHT = { nightEnabled: true, nightStartMin: 22 * 60, nightEndMin: 6 * 60 };

const grid = (settings = NIGHT) =>
  activeGrid({
    zones: [
      { id: 'z1', name: 'Kamsonghin', fee: 1000, nightFee: 500, position: 0, isActive: true },
      { id: 'z2', name: 'Gounghin', fee: 800, nightFee: 0, position: 1, isActive: true },
      { id: 'z3', name: 'Voisins', fee: 0, nightFee: 300, position: 2, isActive: true },
    ],
    bands: [{ id: 'b1', upToMeters: 5000, fee: 1000, nightFee: 700, isActive: true }],
    settings: { allowOtherZone: true, ...settings },
  });
const quote = (g, choice, now) => quoteDelivery(g, choice, RESTO, now);

test('heures de nuit : début compris, fin exclue, la nuit peut passer minuit', () => {
  const night = nightHours(NIGHT);
  assert.equal(isNightTime(night, at(21, 59)), false);
  assert.equal(isNightTime(night, at(22, 0)), true);
  assert.equal(isNightTime(night, at(0, 0)), true);
  assert.equal(isNightTime(night, at(5, 59)), true);
  assert.equal(isNightTime(night, at(6, 0)), false);
  assert.equal(isNightTime(night, at(12, 0)), false);
  // Sans passer minuit (0 h → 5 h)
  const early = { startMin: 0, endMin: 5 * 60 };
  assert.equal(isNightTime(early, at(4, 30)), true);
  assert.equal(isNightTime(early, at(23, 30)), false);
  // Réglage éteint, ou début = fin : jamais la nuit
  assert.equal(nightHours({ ...NIGHT, nightEnabled: false }), null);
  assert.equal(isNightTime(null, at(23)), false);
  assert.equal(isNightTime({ startMin: 600, endMin: 600 }, at(10)), false);
});

test('quartier la nuit : prix + supplément, supplément gardé à part ; le jour : comme avant', () => {
  assert.deepEqual(quote(grid(), { zoneId: 'z1' }, at(23)), {
    source: 'QUARTIER', fee: 1500, nightFee: 500, zoneId: 'z1', zoneName: 'Kamsonghin', distanceM: null,
  });
  assert.deepEqual(quote(grid(), { zoneId: 'z1' }, at(14)), { source: 'QUARTIER', fee: 1000, zoneId: 'z1', zoneName: 'Kamsonghin', distanceM: null });
  // Supplément à 0 F : rien ne change, même la nuit
  assert.deepEqual(quote(grid(), { zoneId: 'z2' }, at(23)), { source: 'QUARTIER', fee: 800, zoneId: 'z2', zoneName: 'Gounghin', distanceM: null });
  // Réglage éteint : jamais de supplément
  assert.equal(quote(grid({ ...NIGHT, nightEnabled: false }), { zoneId: 'z1' }, at(23)).fee, 1000);
});

test('tranche de distance la nuit, et livraison offerte qui devient payante la nuit', () => {
  const q = quote(grid(), { location: north(2) }, at(2));
  assert.equal(q.source, 'DISTANCE');
  assert.equal(q.fee, 1700);
  assert.equal(q.nightFee, 700);
  assert.equal(quote(grid(), { zoneId: 'z3' }, at(12)).fee, 0); // offerte le jour
  assert.deepEqual([quote(grid(), { zoneId: 'z3' }, at(23)).fee, quote(grid(), { zoneId: 'z3' }, at(23)).nightFee], [300, 300]);
  // À confirmer : pas de supplément automatique (l'équipe le saisit)
  assert.equal(quote(grid(), { other: true }, at(23)).nightFee, undefined);
});

test('passage à la nuit entre l’aperçu et la validation : vu comme un changement de frais', () => {
  const shown = quote(grid(), { zoneId: 'z1' }, at(21, 58)).fee; // 1 000 F
  const atOrder = quote(grid(), { zoneId: 'z1' }, at(22, 1));
  assert.equal(
    expectedFeeError(atOrder, shown),
    'Les frais de livraison ont changé : 1 500 F, dont 500 F de supplément de nuit. Vérifiez puis validez à nouveau.',
  );
  assert.equal(expectedFeeError(atOrder, 1500), null);
});

test('frais figés dans la commande, avec le supplément à part', () => {
  assert.deepEqual(orderFeeFields(quote(grid(), { zoneId: 'z1' }, at(23))), {
    deliveryFee: 1500, deliveryFeeSource: 'QUARTIER', deliveryZoneId: 'z1', deliveryZoneName: 'Kamsonghin', deliveryDistanceM: null, deliveryNightFee: 500,
  });
  assert.equal(orderFeeFields(quote(grid(), { zoneId: 'z1' }, at(10))).deliveryNightFee, undefined);
});

test('site public : supplément et heures seulement quand le réglage est allumé', () => {
  const pub = publicGrid(grid(), at(23));
  assert.deepEqual(pub.zones[0], { id: 'z1', name: 'Kamsonghin', fee: 1000, nightFee: 500 });
  assert.deepEqual(pub.night, { from: '22:00', to: '06:00', isNight: true });
  assert.equal(publicGrid(grid(), at(9)).night.isNight, false);
  const off = publicGrid(grid({ nightEnabled: false }), at(23));
  assert.equal(off.night, undefined);
  assert.deepEqual(off.zones[0], { id: 'z1', name: 'Kamsonghin', fee: 1000 });
});

test('équipe : « dont supplément de nuit », jamais plus que les frais', () => {
  const o = { deliveryFee: 1500, deliveryNightFee: 500 };
  assert.deepEqual(nightFeeAfter(o, 2000, undefined), { nightFee: 500 }); // gardé
  assert.deepEqual(nightFeeAfter(o, 300, undefined), { nightFee: 300 }); // ramené au nouveau total
  assert.deepEqual(nightFeeAfter(o, 0, undefined), { nightFee: null });
  assert.deepEqual(nightFeeAfter({ deliveryFee: null, deliveryNightFee: null }, 1200, undefined), { nightFee: null });
  assert.deepEqual(nightFeeAfter(o, 2000, 700), { nightFee: 700 });
  assert.deepEqual(nightFeeAfter(o, 2000, 0), { nightFee: null });
  assert.deepEqual(nightFeeAfter(o, 2000, null), { nightFee: null });
  assert.deepEqual(nightFeeAfter(o, 2000, 2000), { nightFee: 2000 }); // égal au total : permis
  assert.match(nightFeeAfter(o, 2000, 2001).error, /ne peut pas dépasser/);
});

test('correction : même total avec un autre supplément = correction, avec motif', () => {
  const o = { mode: 'LIVRAISON', status: 'PAYEE', deliveryFee: 1500, deliveryNightFee: 500, deliveryFeeMethod: null };
  assert.match(feeCorrectionError(o, 'OPERATEUR', 1500, 'Erreur', 500), /déjà de ce montant/);
  assert.match(feeCorrectionError(o, 'OPERATEUR', 1500, '', null), /motif/);
  assert.equal(feeCorrectionError(o, 'OPERATEUR', 1500, 'Pas de supplément', null), null);
  // Sans supplément donné : comparé à celui de la commande (comme avant le lot 3)
  assert.match(feeCorrectionError({ ...o, deliveryNightFee: null }, 'OPERATEUR', 1500, 'Erreur'), /déjà de ce montant/);
});

test('messages : « (dont X F de supplément de nuit) » dans la valeur du montant, mêmes modèles Meta', () => {
  const ctx = { siteUrl: 'https://site', payment: { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*MONTANT#', MOOV_MONEY: '*2*MONTANT#', TELECEL_MONEY: '*3*MONTANT#' } } };
  const o = { customerName: 'Awa', reference: 'BC-ABC123', itemsTotal: 5500, deliveryFee: 1500, deliveryNightFee: 500, deliveryCode: '1234', status: 'EN_LIVRAISON', mode: 'LIVRAISON' };
  assert.equal(feeWithNight(1500, 500), '1 500 F (dont 500 F de supplément de nuit)');
  assert.equal(feeWithNight(1500, null), '1 500 F');
  for (const key of ['PAIEMENT_CONFIRME', 'EN_PREPARATION', 'EN_ROUTE', 'PAIEMENT_PREPARATION']) {
    const text = renderMessage(key, o, ctx);
    assert.match(text, /Frais de livraison : 1 500 F \(dont 500 F de supplément de nuit\), à payer au livreur/, key);
    assert.match(text, /\*1\*1500#/, `${key} : codes avec le total des frais`);
    assert.doesNotMatch(text, /\{\{\d+\}\}/, key);
    // Même modèle que le jour : rien à faire approuver chez Meta
    assert.equal(messageModel(key, o).template, messageModel(key, { ...o, deliveryNightFee: null }).template, key);
  }
  assert.doesNotMatch(feeSentence({ ...o, deliveryNightFee: null }, ctx), /nuit/);
});

test('page du Patron : supplément de 0 à 50 000 F, heures au format 22:00', () => {
  assert.equal(zoneSchema.parse({ name: 'Gounghin', fee: 500, nightFee: 200 }).nightFee, 200);
  assert.equal(zoneSchema.parse({ name: 'Gounghin', fee: 500 }).nightFee, undefined); // 0 F en base
  assert.throws(() => zoneSchema.parse({ name: 'Gounghin', fee: 500, nightFee: -1 }), /négatif/);
  assert.equal(bandSchema.parse({ upToKm: 3, fee: 500, nightFee: 300 }).nightFee, 300);
  assert.deepEqual(settingsSchema.parse({ nightEnabled: true, nightStart: '22:00', nightEnd: '06:00' }), { nightEnabled: true, nightStart: 1320, nightEnd: 360 });
  assert.deepEqual(settingsSchema.parse({ allowOtherZone: false }), { allowOtherZone: false });
  assert.throws(() => settingsSchema.parse({ nightStart: '22:00', nightEnd: '22:00' }), /différents/);
  assert.throws(() => settingsSchema.parse({ nightStart: '25:00' }), /22:00/);
});
