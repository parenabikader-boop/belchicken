import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHandover, checkPickupCode, cleanCode, courierAssignError, courierStats, generateDeliveryCode, handoverReasonError, MAX_CODE_ATTEMPTS, startOfToday, toCourse,
} from '../src/services/courier.js';
import { renderMessage } from '../src/services/customer-messages.js';
import { courseNotification } from '../src/services/push.message.js';

const livreur = { id: 'l1', name: 'Issa', role: 'LIVREUR', isActive: true };
const course = (extra = {}) => ({ status: 'EN_LIVRAISON', courierId: 'l1', deliveryCode: '0427', deliveryCodeAttempts: 0, ...extra });

test('code de remise : toujours 4 chiffres, zéros compris', () => {
  for (let i = 0; i < 500; i++) assert.match(generateDeliveryCode(), /^\d{4}$/);
  assert.equal(cleanCode(' 04 27 '), '0427');
});

test('choix du livreur : compte Livreur actif, au départ ou pendant la livraison', () => {
  assert.equal(courierAssignError({ status: 'EN_PREPARATION' }, livreur), null);
  assert.equal(courierAssignError({ status: 'EN_LIVRAISON', courierId: 'l2' }, livreur), null);
  assert.match(courierAssignError({ status: 'EN_LIVRAISON', courierId: 'l1' }, livreur), /déjà cette course/);
  assert.match(courierAssignError({ status: 'EN_PREPARATION' }, null), /Choisissez le livreur/);
  assert.match(courierAssignError({ status: 'EN_PREPARATION' }, { ...livreur, role: 'OPERATEUR' }), /pas un compte livreur/);
  assert.match(courierAssignError({ status: 'EN_PREPARATION' }, { ...livreur, isActive: false }), /désactivé/);
  assert.match(courierAssignError({ status: 'PAYEE' }, livreur), /au départ/);
  assert.match(courierAssignError({ status: 'LIVREE' }, livreur), /au départ/);
});

test('remise : le bon code valide, un code faux est compté', () => {
  assert.deepEqual(checkHandover(course(), 'l1', '04 27'), { ok: true });
  const wrong = checkHandover(course(), 'l1', '1234');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.wrong, true);
  assert.match(wrong.error, /Encore 4 essais/);
  assert.match(checkHandover(course({ deliveryCodeAttempts: 3 }), 'l1', '1234').error, /Encore 1 essai\./);
  assert.match(checkHandover(course({ deliveryCodeAttempts: 4 }), 'l1', '1234').error, /appelez l’équipe/);
});

test('remise : bloquée après 5 codes faux, même avec le bon code', () => {
  const r = checkHandover(course({ deliveryCodeAttempts: MAX_CODE_ATTEMPTS }), 'l1', '0427');
  assert.equal(r.ok, false);
  assert.equal(r.wrong, undefined); // pas compté
  assert.match(r.error, /Trop de codes faux/);
});

test('remise : refusée sans compter d’essai si ce n’est pas sa course ou plus en livraison', () => {
  assert.match(checkHandover(course(), 'l2', '0427').error, /pas assignée/);
  assert.match(checkHandover(course({ status: 'ANNULEE' }), 'l1', '0427').error, /annulée/);
  assert.match(checkHandover(course({ status: 'LIVREE' }), 'l1', '0427').error, /déjà livrée/);
  assert.match(checkHandover(course({ deliveryCode: null }), 'l1', '0427').error, /pas de code/);
  const short = checkHandover(course(), 'l1', '427');
  assert.match(short.error, /4 chiffres/);
  assert.equal(short.wrong, undefined);
});

test('livraison validée par l’agent : motif obligatoire', () => {
  assert.match(handoverReasonError(''), /sans code/);
  assert.match(handoverReasonError('  a '), /sans code/);
  assert.equal(handoverReasonError('Client a effacé le message'), null);
  assert.match(handoverReasonError('', true), /la remise au comptoir est validée sans code/);
});

// ─── À emporter : code de retrait tapé au comptoir ───
const ready = (extra = {}) => ({ mode: 'A_EMPORTER', status: 'PRETE', deliveryCode: '4827', deliveryCodeAttempts: 0, ...extra });

test('retrait au comptoir : le bon code valide, un code faux est compté', () => {
  assert.deepEqual(checkPickupCode(ready(), '48 27'), { ok: true });
  const wrong = checkPickupCode(ready(), '1111');
  assert.equal(wrong.wrong, true);
  assert.match(wrong.error, /Encore 4 essais/);
  const last = checkPickupCode(ready({ deliveryCodeAttempts: 4 }), '1111');
  assert.equal(last.wrong, true);
  assert.match(last.error, /validez la remise sans code, avec un motif/);
});

test('retrait au comptoir : bloqué après 5 codes faux, même avec le bon code', () => {
  const r = checkPickupCode(ready({ deliveryCodeAttempts: MAX_CODE_ATTEMPTS }), '4827');
  assert.equal(r.ok, false);
  assert.equal(r.wrong, undefined);
  assert.match(r.error, /Trop de codes faux/);
});

test('retrait au comptoir : refusé sans compter d’essai hors de l’étape « prête »', () => {
  assert.match(checkPickupCode(ready({ mode: 'LIVRAISON' }), '4827').error, /le livreur qui tape le code/);
  assert.match(checkPickupCode(ready({ status: 'EN_PREPARATION' }), '4827').error, /pas prête/);
  assert.match(checkPickupCode(ready({ deliveryCode: null }), '4827').error, /pas de code de retrait/);
  assert.equal(checkPickupCode(ready(), '48').wrong, undefined);
});

test('le livreur voit seulement les frais à encaisser : ni total des plats, ni code, ni paiement', () => {
  const c = toCourse({
    reference: 'BC-7K2Q9M', status: 'EN_LIVRAISON', courierAssignedAt: new Date(), customerName: 'Awa', customerPhone: '+22676123456',
    addressNote: 'Patte d’Oie, portail bleu', latitude: 11.18, longitude: -4.29, locationAccuracy: 12,
    itemsTotal: 7000, deliveryFee: 1000, paymentMethod: 'ORANGE_MONEY', paymentPayerPhone: '+22676543210',
    deliveryCode: '0427', deliveryCodeAttempts: 1,
    items: [{ productName: 'Menu Original', productNumber: 7, variantLabel: 'Menu', choice: null, note: null, quantity: 2, unitPrice: 3500, lineTotal: 7000 }],
    statusChanges: [],
  });
  const text = JSON.stringify(c);
  for (const hidden of ['7000', '3500', '0427', 'ORANGE', '+22676543210']) assert.ok(!text.includes(hidden), hidden);
  assert.equal(c.deliveryFee, 1000);
  assert.equal(c.feePaidBefore, false);
  assert.equal(c.feeMethod, null);
  // Ancienne commande, frais payés avant le départ : rien à encaisser
  assert.equal(toCourse({ ...c, courierAssignedAt: null, items: [], deliveryFeeMethod: 'MOBILE_MONEY' }).feePaidBefore, true);
  assert.equal(c.directionsUrl, 'https://www.google.com/maps/dir/?api=1&destination=11.18,-4.29');
  assert.equal(c.attemptsLeft, 4);
  assert.equal(c.items[0].quantity, 2);
});

test('message « en route » : le code de remise est dedans', () => {
  const ctx = { siteUrl: 'https://belchicken-six.vercel.app', payment: { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*MONTANT#', MOOV_MONEY: '*2*MONTANT#', TELECEL_MONEY: '*3*MONTANT#' } } };;
  const text = renderMessage('EN_ROUTE', { customerName: 'awa', reference: 'BC-7K2Q9M', deliveryCode: '0427', deliveryFee: 1000 }, ctx);
  assert.match(text, /Donnez ce code au livreur à la réception : 0427\./);
  assert.match(text, /suivi\/BC-7K2Q9M/);
});

test('notification de course : ni nom ni adresse sur l’écran verrouillé', () => {
  const n = courseNotification({ reference: 'BC-7K2Q9M', items: [{ quantity: 2 }, { quantity: 1 }] });
  assert.equal(n.title, 'Nouvelle course BC-7K2Q9M');
  assert.match(n.body, /^3 articles/);
  assert.equal(n.url, '/equipe/courses');
});

test('tableau de bord : livraisons et temps moyen par livreur', () => {
  const t = (min) => new Date(Date.UTC(2026, 9, 5, 12, min));
  const stats = courierStats([
    { status: 'LIVREE', courierId: 'l1', courierName: 'Issa', startedAt: t(0), deliveredAt: t(20) },
    { status: 'LIVREE', courierId: 'l1', courierName: 'Issa', startedAt: t(0), deliveredAt: t(31), withoutCode: true },
    { status: 'LIVREE', courierId: 'l2', courierName: 'Moussa', startedAt: t(0), deliveredAt: t(15) },
    { status: 'EN_LIVRAISON', courierId: 'l2', courierName: 'Moussa', startedAt: t(0) },
    { status: 'LIVREE', courierId: null, courierName: null }, // livrée avant l'espace livreur
  ]);
  assert.deepEqual(stats, [
    { name: 'Issa', delivered: 2, withoutCode: 1, avgMinutes: 26 },
    { name: 'Moussa', delivered: 1, withoutCode: 0, avgMinutes: 15 },
  ]);
});

test('courses du jour : à partir de minuit (heure du Burkina = UTC)', () => {
  assert.equal(startOfToday(new Date('2026-10-05T23:59:00Z')).toISOString(), '2026-10-05T00:00:00.000Z');
});
