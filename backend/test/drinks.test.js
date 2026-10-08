import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drinksLabel, drinksText } from '../src/utils/drinks.js';
import { buildNewOrderParams } from '../src/services/whatsapp.message.js';

test('boissons : texte pour toute la ligne (quantité comprise)', () => {
  assert.equal(drinksLabel([{ name: 'Coca-Cola', quantity: 1 }]), 'Boisson : Coca-Cola');
  assert.equal(drinksLabel([{ name: 'Coca-Cola', quantity: 1 }], 2), 'Boissons : 2 Coca-Cola');
  assert.equal(drinksLabel([{ name: 'Coca-Cola', quantity: 2 }, { name: 'Fanta', quantity: 1 }, { name: 'Babali (eau)', quantity: 1 }]), 'Boissons : 2 Coca-Cola, 1 Fanta, 1 Babali (eau)');
  assert.equal(drinksText([]), '');
  assert.equal(drinksLabel(undefined), '');
});

test('alerte équipe : les boissons choisies sont dans la liste des plats', () => {
  const params = buildNewOrderParams({
    reference: 'BC-TEST01', customerName: 'Awa', customerPhone: '+22670112233', itemsTotal: 11000,
    paymentMethod: 'ORANGE_MONEY', paymentPayerPhone: '+22670112233', mode: 'A_EMPORTER',
    items: [{ quantity: 2, productNumber: 7, productName: 'Finest', variantLabel: 'Menu', choice: null, drinks: [{ name: 'Coca-Cola', quantity: 1 }] }],
  });
  assert.equal(params[2], '2× N°7 Finest (Menu, 2 Coca-Cola)');
});
