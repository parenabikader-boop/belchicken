// Plan 4, suivi du client sans messages payants (interrupteur SUIVI_SANS_WHATSAPP, fermé sans ligne). Sans base de
// données. Fermé (ou commande sans clé) : la page de suivi et le call center sont exactement comme avant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_TRACKING, featureMap } from '../src/services/features.js';
import {
  customerPushPayload, customerSubscriptionSchema, isTrackingKey, keyMatches, lockedView, newTrackingKey, quietMode, trackingExtras,
  trackingPath, MAX_CUSTOMER_DEVICES,
} from '../src/services/tracking.js';
import { toPublicOrder } from '../src/services/order.service.js';
import { needsThanks, noticePending, noticeState } from '../src/services/customer-messages.js';
import { pushEnabled } from '../src/config/env.js';

const PAYMENT = { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*11*MONTANT#', MOOV_MONEY: '*2*22*MONTANT#', TELECEL_MONEY: '*3*33*MONTANT#' } };
const ctx = { siteUrl: 'https://belchicken-six.vercel.app', payment: PAYMENT };
const KEY = 'AbCdEfGhIjKlMnOpQrStUv12';
const at = (min) => new Date(Date.UTC(2026, 9, 16, 12, min));
const order = (extra = {}) => ({
  id: 'o1', reference: 'BC-7K2Q9M', mode: 'LIVRAISON', customerName: 'Awa', customerPhone: '+22676123456', paymentMethod: 'ORANGE_MONEY',
  itemsTotal: 7000, deliveryFee: 1000, deliveryNightFee: null, deliveryFeeMethod: null, status: 'EN_LIVRAISON', deliveryOperator: 'PRESTATAIRE',
  courierName: 'Rasmané', courier: { phone: '+22670970009' }, deliveryCode: '0427', trackingKey: KEY, createdAt: at(0),
  items: [], statusChanges: [{ toStatus: 'PAIEMENT_A_VERIFIER', createdAt: at(0) }, { toStatus: 'EN_LIVRAISON', createdAt: at(30) }], events: [],
  ...extra,
});
const SECRET = ['tracking', 'trackingKey', 'trackingLocked'];

test('interrupteur SUIVI_SANS_WHATSAPP : fermé sans ligne, ouvert seulement par le Prestataire', () => {
  assert.equal(CUSTOMER_TRACKING, 'SUIVI_SANS_WHATSAPP');
  assert.equal(featureMap([])[CUSTOMER_TRACKING], false);
  assert.equal(featureMap([{ key: CUSTOMER_TRACKING, enabled: true }])[CUSTOMER_TRACKING], true);
});

test('clé du lien de suivi : 24 caractères au hasard, comparée exactement', () => {
  const k = newTrackingKey();
  assert.equal(isTrackingKey(k), true);
  assert.notEqual(newTrackingKey(), k);
  assert.equal(keyMatches({ trackingKey: KEY }, KEY), true);
  for (const bad of [null, '', 'x', KEY.slice(0, 23), `${KEY}x`, KEY.toLowerCase(), 'AbCdEfGhIjKlMnOpQrStUv1!']) assert.equal(keyMatches({ trackingKey: KEY }, bad), false, String(bad));
  assert.equal(keyMatches({ trackingKey: null }, KEY), false); // commande d'avant : aucune clé ne marche
  assert.equal(trackingPath('BC-7K2Q9M', KEY), `/suivi/BC-7K2Q9M?cle=${KEY}`);
});

test('fermé : la page de suivi est exactement celle d’avant, même pour une commande qui a une clé', () => {
  for (const status of ['PAIEMENT_A_VERIFIER', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE', 'ANNULEE']) {
    const o = order({ status });
    const before = toPublicOrder(o, ctx);
    assert.deepEqual(toPublicOrder(o, ctx, { open: false, key: KEY }), before, status);
    assert.deepEqual(toPublicOrder(o, ctx, null), before, status);
    for (const f of SECRET) assert.equal(f in before, false, `${status} ${f}`);
    assert.equal(JSON.stringify(before).includes('0427'), false); // jamais le code
    assert.equal(JSON.stringify(before).includes('70970009'), false); // jamais le numéro du livreur
  }
});

test('ouvert, commande passée avant (sans clé) : la page d’avant', () => {
  const old = order({ trackingKey: null });
  assert.deepEqual(toPublicOrder(old, ctx, { open: true, key: KEY }), toPublicOrder(old, ctx));
});

test('ouvert, sans la bonne clé : ni code, ni montant, ni livreur', () => {
  for (const key of [null, 'mauvaise', newTrackingKey()]) {
    const pub = toPublicOrder(order(), ctx, { open: true, key });
    assert.equal(pub.trackingLocked, true);
    assert.equal(pub.deliveryFee, null);
    assert.equal(pub.feePayment, null);
    assert.equal(pub.deliveryNightFee, null);
    assert.equal('tracking' in pub, false);
    assert.equal('trackingKey' in pub, false);
    const text = JSON.stringify(pub);
    assert.equal(text.includes('0427'), false);
    assert.equal(text.includes('Rasmané'), false);
    assert.equal(text.includes('70970009'), false);
    // Le reste ne change pas : étapes, plats
    assert.equal(pub.status, 'EN_LIVRAISON');
    assert.deepEqual(pub.steps, toPublicOrder(order(), ctx).steps);
  }
  assert.deepEqual(lockedView({ deliveryFee: 500, feePayment: {}, status: 'X' }), { deliveryFee: null, deliveryNightFee: null, feePayment: null, status: 'X', trackingLocked: true });
});

test('ouvert, avec la clé : livreur à appeler, code, montant à payer au livreur', () => {
  const pub = toPublicOrder(order(), ctx, { open: true, key: KEY });
  assert.deepEqual(pub.tracking.courier, { name: 'Rasmané', phone: '+22670970009' });
  assert.equal(pub.tracking.code, '0427');
  assert.equal(pub.deliveryFee, 1000);
  assert.ok(pub.feePayment);
  assert.equal(pub.tracking.reviewUrl, null);
  assert.deepEqual(pub.tracking.push, pushEnabled() ? { publicKey: process.env.VAPID_PUBLIC_KEY } : null);
  assert.equal('trackingKey' in pub, false); // la clé n'est redonnée qu'à la commande
  // Avant le départ : ni livreur ni code
  const cooking = toPublicOrder(order({ status: 'EN_PREPARATION' }), ctx, { open: true, key: KEY });
  assert.equal(cooking.tracking.courier, null);
  assert.equal(cooking.tracking.code, null);
  // Livrée : « Donner mon avis » si le lien est actif, plus d'alertes à demander
  const done = toPublicOrder(order({ status: 'LIVREE' }), { ...ctx, reviewLink: 'https://site/avis/abc' }, { open: true, key: KEY });
  assert.equal(done.tracking.reviewUrl, 'https://site/avis/abc');
  assert.equal(done.tracking.code, null);
  assert.equal(done.tracking.push, null);
  // À récupérer, prête : le code de retrait
  const ready = toPublicOrder(order({ mode: 'A_EMPORTER', status: 'PRETE', courierName: null }), ctx, { open: true, key: KEY });
  assert.equal(ready.tracking.code, '0427');
  assert.equal(ready.tracking.courier, null);
});

test('à la commande : la clé est donnée une seule fois, dans la réponse', () => {
  const fresh = toPublicOrder(order({ status: 'PAIEMENT_A_VERIFIER' }), ctx, { open: true, fresh: true });
  assert.equal(fresh.trackingKey, KEY);
  assert.ok(fresh.tracking);
  // Commande passée suivi éteint : pas de clé, réponse d'avant
  const off = order({ status: 'PAIEMENT_A_VERIFIER', trackingKey: null });
  assert.deepEqual(toPublicOrder(off, ctx, { open: false, fresh: true }), toPublicOrder(off, ctx));
});

test('ce que la page ajoute, selon l’étape', () => {
  const base = { mode: 'LIVRAISON', courierName: 'Issa', courier: { phone: '+22670000001' }, deliveryCode: '1234' };
  assert.deepEqual(trackingExtras({ ...base, status: 'EN_LIVRAISON' }, { pushKey: 'K' }), {
    courier: { name: 'Issa', phone: '+22670000001' }, code: '1234', reviewUrl: null, push: { publicKey: 'K' },
  });
  assert.equal(trackingExtras({ ...base, status: 'ANNULEE' }, { pushKey: 'K' }).push, null);
  assert.equal(trackingExtras({ ...base, status: 'EN_LIVRAISON', courier: null }).courier.phone, null);
});

test('alertes du client : « en route », « prête », « livrée, merci » ; jamais le code ni le montant', () => {
  const route = customerPushPayload(order());
  assert.equal(route.title, 'Votre commande est en route');
  assert.match(route.body, /Rasmané/);
  assert.equal(route.url, `/suivi/BC-7K2Q9M?cle=${KEY}`);
  assert.equal(route.client, true);
  assert.doesNotMatch(`${route.title} ${route.body}`, /0427|1 000|1000/);
  assert.equal(customerPushPayload(order({ status: 'LIVREE' })).title, 'Commande livrée, merci !');
  assert.equal(customerPushPayload(order({ mode: 'A_EMPORTER', status: 'PRETE' })).title, 'Votre commande est prête');
  assert.equal(customerPushPayload(order({ mode: 'A_EMPORTER', status: 'LIVREE' })).title, 'Commande retirée, merci !');
  // Client anglophone (lot 8)
  assert.equal(customerPushPayload(order({ language: 'EN' })).title, 'Your order is on its way');
  // Pas d'alerte aux autres étapes, ni sans clé
  for (const status of ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'PRETE_LIVRAISON', 'ANNULEE']) assert.equal(customerPushPayload(order({ status })), null, status);
  assert.equal(customerPushPayload(order({ trackingKey: null })), null);
});

test('demande d’alertes : adresse https et clés du téléphone obligatoires', () => {
  const ok = { cle: KEY, subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } } };
  assert.equal(customerSubscriptionSchema.safeParse(ok).success, true);
  assert.equal(customerSubscriptionSchema.safeParse({ ...ok, subscription: { ...ok.subscription, endpoint: 'http://x.y/z' } }).success, false);
  assert.equal(customerSubscriptionSchema.safeParse({ ...ok, subscription: { endpoint: ok.subscription.endpoint, keys: {} } }).success, false);
  assert.equal(customerSubscriptionSchema.safeParse({ subscription: ok.subscription }).success, false);
  assert.equal(MAX_CUSTOMER_DEVICES, 5);
});

test('call center : avec le suivi sans WhatsApp, plus de message à confirmer ni de client à remercier', () => {
  assert.equal(quietMode({}), false);
  assert.equal(quietMode({ auto: false, trackingOpen: false }), false);
  assert.equal(quietMode({ trackingOpen: true }), true);
  assert.equal(quietMode({ auto: true }), true);
  const route = order({ shortFlow: true });
  const delivered = order({ status: 'LIVREE', statusChanges: [...order().statusChanges, { toStatus: 'LIVREE', createdAt: at(50) }] });
  // Fermé : comme avant
  assert.equal(noticePending(route, { auto: quietMode({ trackingOpen: false }) }), true);
  assert.equal(needsThanks(delivered, { auto: quietMode({ trackingOpen: false }) }), true);
  // Ouvert : rien à confirmer, rien à remercier
  assert.equal(noticeState(route, { auto: quietMode({ trackingOpen: true }) }).required, false);
  assert.equal(noticePending(route, { auto: quietMode({ trackingOpen: true }) }), false);
  assert.equal(needsThanks(delivered, { auto: quietMode({ trackingOpen: true }) }), false);
});
