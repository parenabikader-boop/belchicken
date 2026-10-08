import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentMessageKey, customerMessage, firstName, MESSAGES, messageParams, noticeError, noticeState, renderMessage,
} from '../src/services/customer-messages.js';
import { deliveryError, feeMethodError, feeVerifyError, paymentConfirmError } from '../src/services/order-status.js';
import { feeEditRight } from '../src/services/delivery-fees.js';
import { feeSchema } from '../src/routes/staff-orders.routes.js';

// Codes marchands d'essai, différents pour vérifier que chacun est à sa place
const TEST_PAYMENT = { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*11*MONTANT#', MOOV_MONEY: '*2*22*MONTANT#', TELECEL_MONEY: '*3*33*MONTANT#' } };
const ctx = {
  siteUrl: 'https://belchicken-six.vercel.app/',
  payment: TEST_PAYMENT,
  restaurantAddress: 'Kamsonghin, en face de Sonia Hôtel',
  restaurantMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=12.352187,-1.519188',
};
const order = (extra = {}) => ({
  reference: 'BC-7K2Q9M',
  customerName: 'awa Traoré',
  customerPhone: '+22676123456',
  paymentMethod: 'ORANGE_MONEY',
  itemsTotal: 7000,
  deliveryFee: null,
  deliveryFeeMethod: null,
  deliveryFeeVerifiedAt: null,
  status: 'PAYEE',
  ...extra,
});
const VU = new Date('2026-10-06T12:00:00Z');
const FEES =
  'Frais de livraison : 1 000 F, à payer au livreur à la réception, en espèces ou par mobile money avec le code marchand ' +
  '(sans frais, nom affiché : ECOFOOD) :\n' +
  'Orange Money : ```*1*11*1000#```\n' +
  'Moov Money : ```*2*22*1000#```\n' +
  'Telecel Money : ```*3*33*1000#```';

test('prénom : premier mot du nom, avec une majuscule', () => {
  assert.equal(firstName('awa Traoré'), 'Awa');
  assert.equal(firstName('  Jean-Marc  Ouédraogo '), 'Jean-Marc');
  assert.equal(firstName(''), 'cher client');
});

test('paiement confirmé : prénom, référence, montants réels, codes marchands avec les frais et lien de suivi', () => {
  const text = renderMessage('PAIEMENT_CONFIRME', order({ deliveryFee: 1000 }), ctx);
  assert.equal(
    text,
    'Bonjour Awa, nous avons bien reçu votre paiement de 7 000 F pour la commande BC-7K2Q9M. Merci !\n\n' +
      FEES + '\n\n' +
      'Suivez votre commande ici : https://belchicken-six.vercel.app/suivi/BC-7K2Q9M\n\nBelchicken Burkina',
  );
});

test('en préparation et en route : les frais à payer au livreur sont rappelés', () => {
  assert.equal(
    renderMessage('EN_PREPARATION', order({ status: 'EN_PREPARATION', deliveryFee: 1000 }), ctx),
    'Bonjour Awa, votre commande BC-7K2Q9M est en préparation.\n\n' + FEES + '\n\n' +
      'Suivez votre commande ici : https://belchicken-six.vercel.app/suivi/BC-7K2Q9M\n\nBelchicken Burkina',
  );
  const route = renderMessage('EN_ROUTE', order({ status: 'EN_LIVRAISON', deliveryFee: 1000, deliveryCode: '0427' }), ctx);
  assert.match(route, /Donnez ce code au livreur à la réception : 0427\./);
  assert.ok(route.includes(FEES));
});

test('annulée : le motif est repris, sans double point final', () => {
  const text = renderMessage('ANNULEE', order({ status: 'ANNULEE', cancelReason: 'Paiement non reçu.' }), ctx);
  assert.match(text, /^Bonjour Awa, votre commande BC-7K2Q9M a été annulée\.\nMotif : Paiement non reçu\.\n/);
});

test('un message par étape, grisé tant qu’il manque quelque chose', () => {
  assert.equal(currentMessageKey(order({ status: 'PAIEMENT_A_VERIFIER' })), null);
  assert.deepEqual(currentMessageKey(order()), { key: 'PAIEMENT_CONFIRME', missing: 'Saisissez d’abord les frais de livraison.' });
  assert.deepEqual(currentMessageKey(order({ deliveryFee: 1000 })), { key: 'PAIEMENT_CONFIRME' });
  assert.deepEqual(currentMessageKey(order({ status: 'EN_PREPARATION', deliveryFee: 1000 })), { key: 'EN_PREPARATION' });
  assert.deepEqual(currentMessageKey(order({ status: 'EN_LIVRAISON' })), { key: 'EN_ROUTE' });
  assert.deepEqual(currentMessageKey(order({ status: 'LIVREE' })), { key: 'LIVREE' });
  assert.deepEqual(currentMessageKey(order({ status: 'ANNULEE' })), { key: 'ANNULEE' });
});

test('lien wa.me vers le numéro du client, message encodé', () => {
  const m = customerMessage(order({ status: 'EN_LIVRAISON' }), ctx);
  assert.equal(m.key, 'EN_ROUTE');
  assert.ok(m.url.startsWith('https://wa.me/22676123456?text=Bonjour%20Awa%2C%20votre%20commande%20BC-7K2Q9M'));
  assert.equal(decodeURIComponent(m.url.split('?text=')[1]), m.text);
  assert.equal(customerMessage(order(), ctx).url, undefined); // frais pas saisis : pas de lien
});

test('modèles prêts pour Meta : variables numérotées dans l’ordre, ni au début ni à la fin, valeurs sur une ligne', () => {
  const full = order({ status: 'ANNULEE', deliveryFee: 1000, cancelReason: 'Client\ninjoignable' });
  for (const [key, m] of Object.entries(MESSAGES)) {
    const vars = [...m.body.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
    const params = messageParams(key, full, ctx);
    assert.deepEqual([...new Set(vars)].sort((a, b) => a - b), params.map((_, i) => i + 1), key);
    assert.ok(!/^\{\{|\}\}$/.test(m.body.trim()), `${key} : variable au début ou à la fin`);
    for (const p of params) assert.ok(!/[\n\t]/.test(p) && p.length > 0, `${key} : valeur « ${p} »`);
    assert.match(m.template, /^[a-z_]+$/, `${key} : nom de modèle Meta`);
  }
});

test('le livreur part dès que les frais sont saisis : ils sont payés à la réception', () => {
  assert.match(deliveryError(order({ status: 'EN_PREPARATION' })), /Saisissez/);
  assert.equal(deliveryError(order({ status: 'EN_PREPARATION', deliveryFee: 1000 })), null);
});

test('frais : toute l’équipe jusqu’au départ du livreur, le Patron seulement ensuite', () => {
  assert.equal(feeEditRight(order({ status: 'PAIEMENT_A_VERIFIER' })).who, 'TOUS');
  assert.equal(feeEditRight(order({ deliveryFee: 1000 })).who, 'TOUS');
  assert.equal(feeEditRight(order({ status: 'EN_PREPARATION', deliveryFee: 1000 })).who, 'TOUS');
  assert.equal(feeEditRight(order({ status: 'EN_LIVRAISON', deliveryFee: 1000 })).who, 'PATRON');
  // Ancienne commande, frais déjà payés avant le départ
  assert.match(feeEditRight(order({ status: 'EN_PREPARATION', deliveryFee: 1000, deliveryFeeMethod: 'MOBILE_MONEY' })).error, /déjà payés/);
});

test('à la remise : espèces ou mobile money obligatoire', () => {
  const route = order({ status: 'EN_LIVRAISON', deliveryFee: 1000 });
  assert.match(feeMethodError(route, undefined), /espèces ou mobile money/);
  assert.match(feeMethodError(route, 'CARTE'), /espèces ou mobile money/);
  assert.equal(feeMethodError(route, 'ESPECES'), null);
  assert.equal(feeMethodError(route, 'MOBILE_MONEY'), null);
  // Ancienne commande, frais déjà payés : rien à choisir
  assert.equal(feeMethodError({ ...route, deliveryFeeMethod: 'MOBILE_MONEY' }, undefined), null);
});

test('frais à vérifier : mobile money seulement, une fois livrée', () => {
  const mm = order({ status: 'LIVREE', deliveryFee: 1000, deliveryFeeMethod: 'MOBILE_MONEY' });
  assert.equal(feeVerifyError(mm, true), null);
  assert.match(feeVerifyError({ ...mm, deliveryFeeVerifiedAt: VU }, true), /déjà vérifiés/);
  assert.equal(feeVerifyError({ ...mm, deliveryFeeVerifiedAt: VU }, false), null);
  assert.match(feeVerifyError(mm, false), /pas encore vérifiés/);
  assert.match(feeVerifyError({ ...mm, deliveryFeeMethod: 'ESPECES' }, true), /mobile money/);
  assert.match(feeVerifyError({ ...mm, status: 'EN_LIVRAISON' }, true), /une fois la commande livrée/);
});

test('montant des frais : au moins 1 F, entier', () => {
  assert.deepEqual(feeSchema.parse({ amount: 1000 }), { amount: 1000 });
  assert.throws(() => feeSchema.parse({ amount: 0 }), /au moins 1 F/);
  assert.throws(() => feeSchema.parse({ amount: 500.5 }), /centimes/);
  assert.throws(() => feeSchema.parse({ amount: '1000' }), /en F/);
});

// ─────────── Client prévenu à chaque étape ───────────
const at = (hhmm) => new Date(`2026-10-04T${hhmm}:00Z`);
const done = (key, hhmm, type = 'MESSAGE_ENVOYE') => ({ type, messageKey: key, createdAt: at(hhmm) });

test('paiement confirmé : l’étape suivante attend que l’envoi soit confirmé', () => {
  const o = order({
    deliveryFee: 1000,
    statusChanges: [{ toStatus: 'PAIEMENT_A_VERIFIER', createdAt: at('12:00') }, { toStatus: 'PAYEE', createdAt: at('12:05') }],
    events: [{ type: 'FRAIS_SAISIS', createdAt: at('12:05') }, { type: 'MESSAGE_PREPARE', messageKey: 'PAIEMENT_CONFIRME', createdAt: at('12:05') }],
  });
  const pending = noticeState(o);
  assert.equal(pending.key, 'PAIEMENT_CONFIRME');
  assert.equal(pending.required, true); // WhatsApp ouvert ne suffit pas : il faut confirmer
  assert.match(noticeError(pending), /Prévenez d’abord le client \(« Paiement confirmé et frais de livraison »\)/);
  o.events.push(done('PAIEMENT_CONFIRME', '12:06'));
  assert.equal(noticeState(o).required, false);
  assert.equal(noticeError(noticeState(o)), null);
});

test('nouveau montant de frais : le client doit être prévenu à nouveau', () => {
  const o = order({
    deliveryFee: 1500,
    statusChanges: [{ toStatus: 'PAYEE', createdAt: at('12:05') }],
    events: [done('PAIEMENT_CONFIRME', '12:06'), { type: 'FRAIS_SAISIS', amount: 1500, createdAt: at('12:10') }],
  });
  assert.equal(noticeState(o).required, true);
});

test('client sans WhatsApp : prévenu par appel compte comme envoyé', () => {
  const o = order({ status: 'EN_LIVRAISON', statusChanges: [{ toStatus: 'EN_LIVRAISON', createdAt: at('13:00') }], events: [] });
  assert.equal(noticeState(o).required, true);
  o.events.push(done('EN_ROUTE', '13:01', 'CLIENT_APPELE'));
  assert.equal(noticeState(o).confirmed.type, 'CLIENT_APPELE');
  assert.equal(noticeState(o).required, false);
});

test('la confirmation d’une étape ne vaut pas pour la suivante', () => {
  const o = order({
    status: 'EN_PREPARATION', deliveryFee: 1000,
    statusChanges: [{ toStatus: 'PAYEE', createdAt: at('12:05') }, { toStatus: 'EN_PREPARATION', createdAt: at('12:20') }],
    events: [done('PAIEMENT_CONFIRME', '12:06')],
  });
  assert.equal(noticeState(o).key, 'EN_PREPARATION');
  assert.equal(noticeState(o).required, true);
  o.events.push(done('EN_PREPARATION', '12:21'));
  assert.equal(noticeState(o).required, false);
  // Nouveau montant pendant la préparation : le client doit être prévenu à nouveau
  o.events.push({ type: 'FRAIS_SAISIS', amount: 1500, createdAt: at('12:30') });
  assert.equal(noticeState(o).required, true);
});

test('anciennes commandes : le message « frais reçus » déjà confirmé vaut pour la préparation', () => {
  const o = order({
    status: 'EN_PREPARATION', deliveryFee: 1000, deliveryFeeMethod: 'MOBILE_MONEY',
    statusChanges: [{ toStatus: 'EN_PREPARATION', createdAt: at('12:20') }],
    events: [done('FRAIS_RECUS', '12:21')],
  });
  assert.equal(noticeState(o).required, false);
});

test('envoi automatique activé : aucune confirmation demandée', () => {
  const o = order({ status: 'EN_LIVRAISON', statusChanges: [{ toStatus: 'EN_LIVRAISON', createdAt: at('13:00') }], events: [] });
  assert.equal(noticeState(o, { auto: true }).required, false);
  assert.equal(noticeError(noticeState(o, { auto: true })), null);
});

test('paiement à vérifier : rien à dire au client, rien de bloqué', () => {
  assert.equal(noticeState(order({ status: 'PAIEMENT_A_VERIFIER' })), null);
  assert.equal(noticeError(null), null);
});

test('confirmer le paiement demande les frais', () => {
  assert.match(paymentConfirmError(null), /frais de livraison/);
  assert.match(paymentConfirmError(0), /invalides/);
  assert.equal(paymentConfirmError(1000), null);
  // Frais de la grille gardés tels quels, même la livraison offerte
  assert.equal(paymentConfirmError(0, 'LIVRAISON', 0), null);
  assert.match(paymentConfirmError(0, 'LIVRAISON', 1000), /invalides/);
});

// ─── À emporter ───
const pickup = (extra = {}) => order({ mode: 'A_EMPORTER', ...extra });

test('à emporter : messages sans frais, à chaque étape', () => {
  assert.deepEqual(currentMessageKey(pickup({ status: 'PAIEMENT_A_VERIFIER' })), null);
  assert.deepEqual(currentMessageKey(pickup({ status: 'PAYEE' })), { key: 'PAIEMENT_CONFIRME_EMPORTER' });
  assert.deepEqual(currentMessageKey(pickup({ status: 'EN_PREPARATION' })), { key: 'EN_PREPARATION_EMPORTER' });
  assert.deepEqual(currentMessageKey(pickup({ status: 'PRETE' })), { key: 'COMMANDE_PRETE' });
  assert.deepEqual(currentMessageKey(pickup({ status: 'LIVREE' })), { key: 'RETIREE' });
  assert.deepEqual(currentMessageKey(pickup({ status: 'ANNULEE' })), { key: 'ANNULEE' });
  const paid = renderMessage('PAIEMENT_CONFIRME_EMPORTER', pickup({ status: 'PAYEE' }), ctx);
  assert.match(paid, /paiement de 7 000 F pour la commande à emporter BC-7K2Q9M/);
  assert.doesNotMatch(paid, /Frais de livraison/);
});

test('commande prête : code de retrait, adresse du restaurant et lien Itinéraire, jamais la boîte postale', () => {
  assert.equal(
    renderMessage('COMMANDE_PRETE', pickup({ status: 'PRETE', deliveryCode: '4827' }), ctx),
    'Bonjour Awa, votre commande BC-7K2Q9M est prête ! Vous pouvez venir la retirer au restaurant.\n\n' +
      'Au comptoir, donnez ce code : 4827. Ne le donnez qu’au comptoir, quand on vous remet la commande.\n\n' +
      'Adresse : Kamsonghin, en face de Sonia Hôtel\n' +
      'Itinéraire : https://www.google.com/maps/dir/?api=1&destination=12.352187,-1.519188\n\nBelchicken Burkina',
  );
  assert.doesNotMatch(MESSAGES.COMMANDE_PRETE.body, /BP/);
});

test('à emporter : l’étape « prête » demande que le client soit prévenu avant la remise', () => {
  const at = new Date('2026-10-06T12:00:00Z');
  const o = pickup({ status: 'PRETE', statusChanges: [{ toStatus: 'PRETE', createdAt: at }], events: [] });
  assert.match(noticeError(noticeState(o)), /Commande prête à retirer/);
  const sent = { ...o, events: [{ type: 'MESSAGE_ENVOYE', messageKey: 'COMMANDE_PRETE', createdAt: new Date(at.getTime() + 1000) }] };
  assert.equal(noticeError(noticeState(sent)), null);
});
