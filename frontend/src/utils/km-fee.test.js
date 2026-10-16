import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutOrder, kmAcceptedFor, quoteReady } from './km-fee.js';

const Q = { source: 'KM_ROUTE', fee: 1400, zoneName: null, distanceKm: 4.2, kmMode: true };

test('frais acceptés : le même montant, la même origine ; tout changement demande d’accepter de nouveau', () => {
  assert.equal(kmAcceptedFor(Q, { ...Q }), true);
  assert.equal(kmAcceptedFor({ ...Q, fee: 1500 }, Q), false); // nouvelle position, prix changé
  assert.equal(kmAcceptedFor({ ...Q, source: 'KM_ESTIMATION' }, Q), false);
  assert.equal(kmAcceptedFor({ source: 'QUARTIER', fee: 1400, zoneName: 'Gounghin' }, Q), false); // quartier choisi ensuite
  assert.equal(kmAcceptedFor(Q, null), false);
  assert.equal(kmAcceptedFor({ loading: true }, Q), false);
  assert.equal(kmAcceptedFor({ error: 'Trop loin' }, Q), false);
  assert.equal(quoteReady({ ...Q, fee: 0 }), true); // livraison offerte : à accepter aussi
});

test('page « Vos informations » : la livraison avant le paiement seulement avec la grille par km', () => {
  assert.deepEqual(checkoutOrder(false), ['contact', 'payment', 'mode']); // comme avant
  assert.deepEqual(checkoutOrder(true), ['contact', 'mode', 'payment']);
});
