import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryPayload, deliveryPrice, locationPayload, mapLocation, missingFields, needsMap, paymentVisible, simpleOrderState,
} from './simple-order.js';

test('fermé (ou réponse inconnue) : le site actuel', () => {
  assert.equal(simpleOrderState(null, null, false), false);
  assert.equal(simpleOrderState(null, { anglais: false, menuBorne: true }, true), false); // réponse d'avant : rien de plus
  assert.equal(simpleOrderState('1', { anglais: false, menuBorne: false }, true), false); // refermé : la réponse gagne
  assert.equal(simpleOrderState('0', null, true), false); // serveur injoignable : dernière réponse gardée
  assert.equal(simpleOrderState('1', null, true), true);
  assert.equal(simpleOrderState(null, { commandeSimple: true }, true), true);
});

test('position : GPS, sinon un point sur la carte ; jamais de quartier', () => {
  assert.equal(needsMap({ geoState: 'denied', geo: null }), true);
  assert.equal(needsMap({ geoState: 'unsupported', geo: null }), true);
  assert.equal(needsMap({ geoState: null, geo: { accuracy: 2500 } }), true); // trop imprécise
  assert.equal(needsMap({ geoState: null, geo: { accuracy: 30 } }), false);
  assert.equal(needsMap({ geoState: null, geo: null }), false);
  assert.deepEqual(mapLocation({ lat: 12.3700001234, lng: -1.53 }), { latitude: 12.37, longitude: -1.53, picked: true });
  assert.deepEqual(locationPayload({ latitude: 1, longitude: 2, accuracy: 30 }), { latitude: 1, longitude: 2, accuracy: 30 });
  assert.deepEqual(locationPayload(mapLocation({ lat: 1, lng: 2 })), { latitude: 1, longitude: 2 }); // point de la carte : sans précision
  assert.equal(locationPayload(null), undefined);
});

test('paiement visible seulement une fois le prix de livraison affiché (tout de suite à emporter)', () => {
  const geo = { latitude: 1, longitude: 2 };
  const quote = { source: 'KM_ROUTE', fee: 1400, distanceKm: 4.2 };
  assert.equal(paymentVisible({ mode: 'A_EMPORTER' }), true);
  assert.equal(paymentVisible({ mode: 'LIVRAISON', geo: null, gridOn: true, quote }), false);
  assert.equal(paymentVisible({ mode: 'LIVRAISON', geo, gridOn: true, quote: { loading: true } }), false);
  assert.equal(paymentVisible({ mode: 'LIVRAISON', geo, gridOn: true, quote: { error: 'Trop loin' } }), false);
  assert.equal(paymentVisible({ mode: 'LIVRAISON', geo, gridOn: true, quote }), true);
  assert.equal(paymentVisible({ mode: 'LIVRAISON', geo, gridOn: false, quote: null }), true); // pas de grille : l'équipe donne le prix
  assert.deepEqual(deliveryPrice(quote), { fee: 1400, km: 4.2, estimate: false });
  assert.deepEqual(deliveryPrice({ source: 'A_CONFIRMER', fee: null }), { fee: null, km: null, estimate: false });
});

test('la commande envoie le montant affiché (comparé par le serveur), jamais un quartier ni un prix à elle', () => {
  const quote = { source: 'KM_ROUTE', fee: 1400, distanceKm: 4.2 };
  assert.deepEqual(deliveryPayload({ mode: 'LIVRAISON', gridOn: true, quote }), { expectedFee: 1400 });
  assert.deepEqual(deliveryPayload({ mode: 'LIVRAISON', gridOn: true, quote: { source: 'A_CONFIRMER', fee: null } }), { expectedFee: null });
  assert.equal(deliveryPayload({ mode: 'A_EMPORTER', gridOn: true, quote }), undefined);
  assert.equal(deliveryPayload({ mode: 'LIVRAISON', gridOn: false, quote }), undefined);
  assert.equal('zoneId' in deliveryPayload({ mode: 'LIVRAISON', gridOn: true, quote }), false);
});

test('avant d’envoyer : position, prix, nom, téléphone, opérateur, numéro qui a payé', () => {
  const ok = { mode: 'LIVRAISON', geo: { latitude: 1, longitude: 2 }, name: 'Awa', phone: '70 12 34 56', method: 'ORANGE_MONEY', payer: '+226 70 12 34 56' };
  const quote = { fee: 1400 };
  assert.deepEqual(missingFields(ok, { gridOn: true, quote }), []);
  assert.deepEqual(missingFields({ ...ok, geo: null }, { gridOn: true, quote: null }), ['geo']);
  assert.deepEqual(missingFields(ok, { gridOn: true, quote: { loading: true } }), ['price']);
  assert.deepEqual(missingFields({ ...ok, mode: 'A_EMPORTER', geo: null }, { gridOn: true, quote: null }), []);
  assert.deepEqual(missingFields({ ...ok, name: 'A', phone: '123', method: null, payer: '' }, { gridOn: true, quote }), ['name', 'phone', 'method', 'payer']);
});

test('dernier plat ajouté : nouvelle ligne ou quantité augmentée, jamais un retrait', async () => {
  const { addedLabel, addedLine, WIDE_QUERY } = await import('./simple-order.js');
  const a = { key: 'a', quantity: 1 };
  const b = { key: 'b', quantity: 2 };
  assert.equal(addedLine([], [a]), 'a');
  assert.equal(addedLine([a], [a, b]), 'b');
  assert.equal(addedLine([a, b], [a, { ...b, quantity: 3 }]), 'b');
  assert.equal(addedLine([a, b], [a, { ...b, quantity: 1 }]), null); // −
  assert.equal(addedLine([a, b], [b]), null); // retiré
  assert.equal(addedLine([a], [a]), null);
  const finest = { product: { name: 'Finest', variants: [{}, {}] }, variant: { label: 'Menu' } };
  assert.equal(addedLabel(finest), 'Finest · Menu');
  assert.equal(addedLabel({ product: { name: 'Coca', variants: [{}] }, variant: { label: 'Seul' } }), 'Coca');
  assert.equal(addedLabel(undefined), null);
  assert.equal(WIDE_QUERY, '(min-width: 900px)');
});

test('écran large : le panneau seulement avec des plats ; panier vide, le menu prend toute la largeur', async () => {
  const { sidePanelShown } = await import('./simple-order.js');
  assert.equal(sidePanelShown(true, 0), false);
  assert.equal(sidePanelShown(true, 1), true);
  assert.equal(sidePanelShown(true, 12), true);
  assert.equal(sidePanelShown(false, 3), false); // téléphone : la barre en bas
});
