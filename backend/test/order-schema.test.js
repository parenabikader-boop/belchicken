import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderSchema } from '../src/validators/order.schema.js';

const base = {
  customer: { name: 'Awa Ouédraogo', phone: '76 12 34 56' },
  payment: { method: 'ORANGE_MONEY', payerPhone: '76123456' },
  addressNote: 'Patte d’Oie, portail bleu',
  items: [{ productId: 'p1', variantId: 'v1', quantity: 2 }],
};

test('accepte une commande Orange Money avec repères', () => {
  const o = createOrderSchema.parse(base);
  assert.equal(o.customer.phone, '+22676123456');
});

test('refuse le paiement en espèces avec un message en français', () => {
  const r = createOrderSchema.safeParse({ ...base, payment: { method: 'ESPECES' } });
  assert.equal(r.success, false);
  assert.equal(r.error.issues[0].path.join('.'), 'payment.method');
  assert.equal(r.error.issues[0].message, 'Le paiement se fait uniquement par Orange Money ou Moov Money.');
});

test('exige le numéro ayant payé pour le mobile money', () => {
  const r = createOrderSchema.safeParse({ ...base, payment: { method: 'ORANGE_MONEY' } });
  assert.equal(r.success, false);
  assert.equal(r.error.issues[0].path.join('.'), 'payment.payerPhone');
});

test('accepte le mobile money sans numéro de transaction et normalise le numéro ayant payé', () => {
  const o = createOrderSchema.parse({ ...base, payment: { method: 'MOOV_MONEY', payerPhone: '60 44 21 08' } });
  assert.deepEqual(o.payment, { method: 'MOOV_MONEY', payerPhone: '+22660442108' });
});

test("ignore un numéro de transaction envoyé par une ancienne version du site", () => {
  const o = createOrderSchema.parse({ ...base, payment: { method: 'ORANGE_MONEY', payerPhone: '76123456', reference: 'PP2609.A58213' } });
  assert.equal(o.payment.reference, undefined);
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
