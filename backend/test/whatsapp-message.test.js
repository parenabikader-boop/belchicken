import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewOrderParams } from '../src/services/whatsapp.message.js';

test('construit les 6 paramètres du modèle sans retour à la ligne', () => {
  const params = buildNewOrderParams({
    reference: 'BC-7K2Q9M',
    customerName: 'Awa Ouédraogo',
    customerPhone: '+22676123456',
    paymentMethod: 'ORANGE_MONEY',
    paymentPayerPhone: '+22676123456',
    latitude: 11.17715,
    longitude: -4.2979,
    addressNote: 'Secteur 22\nportail bleu',
    itemsTotal: 14000,
    items: [
      { quantity: 1, productNumber: 7, productName: 'Finest', variantLabel: 'Menu', choice: null },
      { quantity: 1, productNumber: 13, productName: "Chef's Combo", variantLabel: null, choice: null },
    ],
  });
  assert.equal(params.length, 6);
  assert.equal(params[0], 'BC-7K2Q9M');
  assert.equal(params[2], "1× N°7 Finest (Menu), 1× N°13 Chef's Combo");
  assert.equal(params[3], '14 000 F');
  assert.equal(params[4], 'Orange Money depuis +22676123456');
  assert.match(params[5], /^https:\/\/maps\.google\.com\/\?q=11\.17715,-4\.2979 · Secteur 22 · portail bleu$/);
  for (const p of params) assert.ok(!/[\n\t]| {5,}/.test(p));
});

test('paiement Moov Money avec le numéro qui a payé', () => {
  const params = buildNewOrderParams({
    reference: 'BC-7K2Q9M', customerName: 'Awa', customerPhone: '+22676123456', paymentMethod: 'MOOV_MONEY',
    paymentPayerPhone: '+22660442108', latitude: null, longitude: null, addressNote: 'Secteur 22', itemsTotal: 5500, items: [],
  });
  assert.equal(params[4], 'Moov Money depuis +22660442108');
});
