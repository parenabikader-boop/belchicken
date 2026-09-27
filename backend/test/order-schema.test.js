import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderSchema } from '../src/validators/order.schema.js';

const base = {
  customer: { name: 'Awa Ouédraogo', phone: '76 12 34 56' },
  payment: { method: 'ESPECES' },
  addressNote: 'Secteur 22, portail bleu',
  items: [{ productId: 'p1', variantId: 'v1', quantity: 2 }],
};

test('accepte une commande en espèces avec repères', () => {
  const o = createOrderSchema.parse(base);
  assert.equal(o.customer.phone, '+22676123456');
});

test('exige le numéro de transaction pour le mobile money', () => {
  const r = createOrderSchema.safeParse({ ...base, payment: { method: 'ORANGE_MONEY', payerPhone: '76123456' } });
  assert.equal(r.success, false);
});

test('met la référence de transaction en majuscules', () => {
  const o = createOrderSchema.parse({ ...base, payment: { method: 'MOOV_MONEY', payerPhone: '60442108', reference: 'mp2609.1440 77120' } });
  assert.equal(o.payment.reference, 'MP2609.144077120');
  assert.equal(o.payment.payerPhone, '+22660442108');
});

test('exige une position ou des repères', () => {
  const r = createOrderSchema.safeParse({ ...base, addressNote: '' });
  assert.equal(r.success, false);
  assert.match(r.error.issues[0].message, /position/);
  const ok = createOrderSchema.safeParse({ ...base, addressNote: undefined, location: { latitude: 11.17, longitude: -4.29, accuracy: 12 } });
  assert.equal(ok.success, true);
});

test('refuse une commande vide ou une quantité invalide', () => {
  assert.equal(createOrderSchema.safeParse({ ...base, items: [] }).success, false);
  assert.equal(createOrderSchema.safeParse({ ...base, items: [{ productId: 'p1', variantId: 'v1', quantity: 0 }] }).success, false);
});
