// Plan 2, paiement du repas validé automatiquement (interrupteurs PAIEMENT_AUTO_SMS, PAIEMENT_SMS_ESSAI et
// PAIEMENT_LIGDICASH, fermés sans ligne). Sans base de
// données ni vrai réseau. Solution B (SMS du téléphone marchand) et structure de la solution A (Ligdicash).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_PAYMENT_LIGDICASH, AUTO_PAYMENT_SMS, autoPaymentModes, FEATURES, featureMap, SMS_TRIAL_FORMATS } from '../src/services/features.js';
import { DEFAULT_SMS_FORMATS } from '../src/services/payment-sms-formats.js';
import {
  autoReason, decide, dedupeKey, formatForSender, formatsForSender, loadFormats, ORDER_AFTER_SMS_MS, ORDER_BEFORE_SMS_MS, orderMatches, parseAmount, parseSms,
  paymentForNewOrder, senderKey, smsBodySchema, smsKeyMatches,
} from '../src/services/payment-sms.js';
import { callbackReference, CONFIRM_URL, CREATE_URL, invoiceBody, invoiceError, ligdicashHeaders, ligdicashReady, readConfirm, readCreate } from '../src/services/ligdicash.js';

// Formats définitifs (sans les formats d'essai) ; vérifiés (pour les tests) : les mêmes, marqués vérifiés
const SUPPOSED = DEFAULT_SMS_FORMATS.filter((f) => !f.trial);
const VERIFIED = SUPPOSED.map((f) => ({ ...f, supposed: false }));
const ORANGE = SUPPOSED[0].example;
const TRIAL = DEFAULT_SMS_FORMATS.find((f) => f.trial);
// Vrais SMS Orange Money Burkina du 16 octobre 2026 (noms remplacés par XXX, soldes modifiés)
const OM_RECU = 'Vous avez recu 101.0 FCFA, Frais: FCFA, Taxe:  FCFA du 07516439,XXX. Le solde de votre compte est de 1234.567 FCFA Trans ID: PP261016.1647.95770711. Flashez le QR CODE marchand avec Max it pour plus de facilite : https://onelink.to/nn64xw';
const OM_ENVOYE = 'Cher client, vous avez transfere 15,000.00 FCFA, Frais: 0.0 FCFA, Taxe:  FCFA au numero 57111890,XXX. Votre solde est de  1234.567 FCFA. ID Trans: PP261016.1634.2991115. Pour toute reclamation contactez par appel le 127 ou whatsapp 07000121. Orange Money BF';
const NOW = new Date('2026-10-16T12:00:00Z');
const min = (n) => new Date(NOW.getTime() + n * 60000);
const order = (extra = {}) => ({
  id: 'o1', reference: 'BC-AAAAAA', status: 'PAIEMENT_A_VERIFIER', paymentMethod: 'ORANGE_MONEY', itemsTotal: 7000,
  paymentPayerPhone: '+22670123456', createdAt: min(-10), ...extra,
});
const PAY = { operator: 'ORANGE_MONEY', amount: 7000, phone: '+22670123456', receivedAt: NOW };

test('deux interrupteurs indépendants, SMS et Ligdicash, fermés sans ligne ; plus d’interrupteur unique', () => {
  assert.equal(AUTO_PAYMENT_SMS, 'PAIEMENT_AUTO_SMS');
  assert.equal(AUTO_PAYMENT_LIGDICASH, 'PAIEMENT_LIGDICASH');
  assert.equal(SMS_TRIAL_FORMATS, 'PAIEMENT_SMS_ESSAI');
  assert.ok(!FEATURES.some((f) => f.key === 'PAIEMENT_AUTO'));
  assert.equal(FEATURES.find((f) => f.key === AUTO_PAYMENT_SMS).label, 'Paiement automatique par SMS');
  assert.equal(FEATURES.find((f) => f.key === AUTO_PAYMENT_LIGDICASH).label, 'Paiement en ligne Ligdicash');
  const modes = (rows) => autoPaymentModes(featureMap(rows));
  const on = (key) => ({ key, enabled: true });
  // Les deux fermés (aucune ligne, ou une vieille ligne PAIEMENT_AUTO) : vérification à la main, comme avant
  assert.deepEqual(modes([]), { sms: false, trial: false, ligdicash: false, any: false });
  assert.deepEqual(modes([on('PAIEMENT_AUTO')]), { sms: false, trial: false, ligdicash: false, any: false });
  assert.deepEqual(modes([on(AUTO_PAYMENT_SMS)]), { sms: true, trial: false, ligdicash: false, any: true });
  // Ligdicash seul : les SMS éteints ne cassent rien
  assert.deepEqual(modes([on(AUTO_PAYMENT_LIGDICASH)]), { sms: false, trial: false, ligdicash: true, any: true });
  assert.deepEqual(modes([on(AUTO_PAYMENT_SMS), on(AUTO_PAYMENT_LIGDICASH)]), { sms: true, trial: false, ligdicash: true, any: true });
  // Formats d'essai : seulement avec les SMS
  assert.equal(modes([on(SMS_TRIAL_FORMATS)]).trial, false);
  assert.equal(modes([on(SMS_TRIAL_FORMATS), on(AUTO_PAYMENT_SMS)]).trial, true);
});

test('les deux ouverts : une commande n’a qu’un paiement, jamais validée deux fois', () => {
  // Paiement déjà reçu par SMS (rattaché) : pas de facture Ligdicash
  assert.equal(invoiceError({ status: 'PAIEMENT_A_VERIFIER', autoPayment: null }), null);
  assert.match(invoiceError({ status: 'PAIEMENT_A_VERIFIER', autoPayment: { id: 'p1' } }), /déjà reçu/);
  assert.match(invoiceError({ status: 'PAYEE', autoPayment: null }), /n’attend pas/);
  assert.match(invoiceError(null), /n’attend pas/);
  // Commande déjà validée (par Ligdicash ou à la main) : un SMS ne la rapproche plus
  assert.equal(decide([order({ status: 'PAYEE' })], PAY).status, 'AUCUNE');
  assert.equal(decide([order({ status: 'EN_PREPARATION' })], PAY).status, 'AUCUNE');
});

test('format d’essai « Orange Money · transfert reçu » : vrai SMS reçu lu, envoyé écarté', () => {
  assert.equal(TRIAL.operator, 'ORANGE_MONEY');
  assert.equal(TRIAL.trial, true);
  assert.notEqual(TRIAL.supposed, true); // vérifié sur de vrais SMS
  assert.equal(TRIAL.example, OM_RECU);
  assert.deepEqual(parseSms({ sender: 'OrangeMoney', text: OM_RECU }, DEFAULT_SMS_FORMATS, { trial: true }), {
    operator: 'ORANGE_MONEY', label: 'Orange Money · transfert reçu (essai)', supposed: false, trial: true,
    ok: true, amount: 101, phone: '+22607516439', txid: 'PP261016.1647.95770711',
  });
  // Même numéro, quel que soit le format saisi par le client
  for (const typed of ['07516439', '07 51 64 39', '+226 07 51 64 39', '0022607516439', '22607516439']) {
    assert.equal(orderMatches(order({ itemsTotal: 101, paymentPayerPhone: typed }), { operator: 'ORANGE_MONEY', amount: 101, phone: '+22607516439', receivedAt: NOW }), true, typed);
  }
  // Transfert envoyé : écarté (avec ou sans formats d'essai)
  for (const trial of [true, false]) {
    const r = parseSms({ sender: 'OrangeMoney', text: OM_ENVOYE }, DEFAULT_SMS_FORMATS, { trial });
    assert.equal(r.ok, false, String(trial));
    assert.match(r.reason, /Pas un paiement reçu/);
  }
  // Interrupteur « Formats SMS d'essai » fermé : le format d'essai est ignoré, le SMS reste au format supposé (ne valide rien)
  const closed = parseSms({ sender: 'OrangeMoney', text: OM_RECU }, DEFAULT_SMS_FORMATS);
  assert.equal(closed.trial, false);
  assert.equal(closed.supposed, true);
  assert.equal(formatsForSender(DEFAULT_SMS_FORMATS, 'OrangeMoney').some((f) => f.trial), false);
  assert.equal(formatsForSender(DEFAULT_SMS_FORMATS, 'OrangeMoney', { trial: true })[0], TRIAL);
  // L'ancien exemple (paiement reçu) passe toujours au format suivant
  assert.equal(parseSms({ sender: 'OrangeMoney', text: ORANGE }, DEFAULT_SMS_FORMATS, { trial: true }).label, 'Orange Money');
  // Montants au format Orange : point décimal, virgule des milliers
  for (const [text, n] of [['101.0', 101], ['15,000.00', 15000], ['1,500.0', 1500], ['2,500', 2500]]) assert.equal(parseAmount(text), n, text);
  assert.equal(parseSms({ sender: 'OrangeMoney', text: OM_RECU.replace('101.0', '7,500.00') }, DEFAULT_SMS_FORMATS, { trial: true }).amount, 7500);
  assert.equal(dedupeKey({ sender: 'OrangeMoney', text: OM_RECU }, parseSms({ sender: 'OrangeMoney', text: OM_RECU }, DEFAULT_SMS_FORMATS, { trial: true })), 'SMS:ORANGE_MONEY:PP261016.1647.95770711');
});

test('formats : supposés tant que les vrais SMS ne sont pas vérifiés ; un format supposé ne valide jamais', () => {
  assert.ok(SUPPOSED.every((f) => f.supposed === true));
  assert.deepEqual(SUPPOSED.map((f) => f.operator), ['ORANGE_MONEY', 'MOOV_MONEY', 'TELECEL_MONEY']);
  for (const f of SUPPOSED) {
    const r = parseSms({ sender: f.senders[0], text: f.example });
    assert.equal(r.ok, true, f.label);
    assert.equal(r.supposed, true, f.label); // auto-payment.service.js : FORMAT_A_VERIFIER, aucune validation
    assert.equal(r.amount, 7000, f.label);
    assert.match(r.phone, /^\+226\d{8}$/, f.label);
    assert.ok(r.txid, f.label);
  }
});

test('lecture d’un SMS : seulement les expéditeurs officiels, seulement un paiement reçu', () => {
  assert.deepEqual(parseSms({ sender: 'OrangeMoney', text: ORANGE }, VERIFIED), {
    operator: 'ORANGE_MONEY', label: 'Orange Money', supposed: false, trial: false, ok: true, amount: 7000, phone: '+22670123456', txid: 'PP241016.1530.A12345',
  });
  assert.equal(parseSms({ sender: 'ORANGE-MONEY', text: ORANGE }, VERIFIED).ok, true); // majuscules et tirets ignorés
  for (const sender of ['+22670000000', 'Orange Mon3y', 'OrangeMoneyBF', '', 'Banque']) {
    assert.deepEqual(parseSms({ sender, text: ORANGE }, VERIFIED), { ignored: true }, sender); // faux expéditeur
  }
  assert.equal(parseSms({ sender: 'OrangeMoney', text: 'Vous avez envoye 7000 FCFA au 70123456. Trans ID: PP1234567.' }, VERIFIED).ok, false);
  assert.equal(parseSms({ sender: 'OrangeMoney', text: 'Retrait de 7000 FCFA effectue. Solde 1000 FCFA' }, VERIFIED).ok, false);
  assert.equal(parseSms({ sender: 'OrangeMoney', text: 'Promo : gagnez 1 Go !' }, VERIFIED).ok, false);
  assert.match(parseSms({ sender: 'OrangeMoney', text: 'Vous avez recu un paiement de 7000 FCFA. Trans ID: PP12345.' }, VERIFIED).reason, /Numéro/);
  assert.equal(senderKey(' Orange Money '), 'orangemoney');
  assert.equal(formatForSender(VERIFIED, 'moovmoney').operator, 'MOOV_MONEY');
});

test('montants : espaces, points, virgules, centimes', () => {
  for (const [text, n] of [['7000', 7000], ['7 000', 7000], ['7.000', 7000], ['7,000', 7000], ['7000.00', 7000], ['7 000,50', 7000], ['150.000', 150000], ['7 000', 7000]]) {
    assert.equal(parseAmount(text), n, text);
  }
  for (const bad of ['', null, 'abc', '0', '-5']) assert.equal(parseAmount(bad), null, String(bad));
});

test('formats réglables : la variable SMS_PAIEMENT_FORMATS passe avant le fichier, si elle est valide', () => {
  assert.equal(loadFormats('').formats, DEFAULT_SMS_FORMATS);
  const mine = JSON.stringify([{ ...VERIFIED[0], senders: ['OM-BF'] }]);
  const loaded = loadFormats(mine);
  assert.equal(loaded.error, null);
  assert.equal(parseSms({ sender: 'OM-BF', text: ORANGE }, loaded.formats).ok, true);
  assert.equal(parseSms({ sender: 'OrangeMoney', text: ORANGE }, loaded.formats).ignored, true);
  assert.match(loadFormats('{pas du json').error, /illisible/);
  assert.equal(loadFormats('{pas du json').formats, DEFAULT_SMS_FORMATS);
  assert.match(loadFormats(JSON.stringify([{ ...VERIFIED[0], amount: '([0-9' }])).error, /Expression invalide/);
  assert.match(loadFormats(JSON.stringify([{ ...VERIFIED[0], operator: 'ESPECES' }])).error, /illisible/);
});

test('un SMS ne compte qu’une fois : n° de transaction, sinon empreinte du texte', () => {
  const p = parseSms({ sender: 'OrangeMoney', text: ORANGE }, VERIFIED);
  assert.equal(dedupeKey({ sender: 'OrangeMoney', text: ORANGE }, p), 'SMS:ORANGE_MONEY:PP241016.1530.A12345');
  const noId = { sender: 'X', text: 'texte' };
  assert.equal(dedupeKey(noId, { ok: false }), dedupeKey({ sender: 'x', text: '  texte ' }, { ok: false }));
  assert.notEqual(dedupeKey(noId, { ok: false }), dedupeKey({ sender: 'X', text: 'autre' }, { ok: false }));
});

test('rapprochement : numéro qui a payé + montant exact + même opérateur + commande en attente récente', () => {
  assert.equal(orderMatches(order(), PAY), true);
  assert.equal(orderMatches(order({ paymentPayerPhone: '70 12 34 56' }), PAY), true); // même numéro, écrit autrement
  assert.equal(orderMatches(order({ itemsTotal: 7500 }), PAY), false); // montant différent
  assert.equal(orderMatches(order({ paymentPayerPhone: '+22670123457' }), PAY), false); // autre numéro
  assert.equal(orderMatches(order({ paymentMethod: 'MOOV_MONEY' }), PAY), false); // autre opérateur
  assert.equal(orderMatches(order({ status: 'PAYEE' }), PAY), false); // déjà vérifiée
  assert.equal(orderMatches(order({ createdAt: new Date(NOW.getTime() - ORDER_BEFORE_SMS_MS - 1000) }), PAY), false); // trop ancienne
  assert.equal(orderMatches(order({ createdAt: new Date(NOW.getTime() + ORDER_AFTER_SMS_MS - 1000) }), PAY), true); // payée avant d'envoyer
  assert.equal(orderMatches(order({ createdAt: new Date(NOW.getTime() + ORDER_AFTER_SMS_MS + 1000) }), PAY), false);
});

test('une seule commande possible : validée ; aucune ou plusieurs : à vérifier par le call center', () => {
  assert.equal(decide([order()], PAY).status, 'VALIDEE');
  assert.equal(decide([order({ itemsTotal: 9000 })], PAY).status, 'AUCUNE');
  assert.equal(decide([], PAY).status, 'AUCUNE');
  const doubt = decide([order(), order({ id: 'o2', reference: 'BC-BBBBBB', createdAt: min(-5) })], PAY);
  assert.equal(doubt.status, 'DOUTE');
  assert.deepEqual(doubt.references, ['BC-AAAAAA', 'BC-BBBBBB']);
});

test('commande passée après le SMS : le paiement reçu juste avant la valide, sauf doute', () => {
  const sms = { id: 'p1', status: 'AUCUNE', orderId: null, operator: 'ORANGE_MONEY', amount: 7000, payerPhone: '+22670123456', receivedAt: min(-5) };
  const fresh = order({ createdAt: NOW });
  assert.equal(paymentForNewOrder(fresh, [sms], [fresh]).status, 'VALIDEE');
  assert.equal(paymentForNewOrder(fresh, [{ ...sms, receivedAt: min(-40) }], [fresh]).status, 'AUCUNE'); // SMS trop ancien
  assert.equal(paymentForNewOrder(fresh, [{ ...sms, orderId: 'autre' }], [fresh]).status, 'AUCUNE'); // déjà utilisé
  assert.equal(paymentForNewOrder(fresh, [{ ...sms, status: 'VALIDEE' }], [fresh]).status, 'AUCUNE');
  const rival = order({ id: 'o2', reference: 'BC-BBBBBB', createdAt: min(-8) });
  assert.equal(paymentForNewOrder(fresh, [sms], [fresh, rival]).status, 'DOUTE'); // une autre commande pourrait être la bonne
  assert.equal(paymentForNewOrder(fresh, [sms, { ...sms, id: 'p2' }], [fresh]).status, 'DOUTE'); // deux SMS possibles
  assert.match(autoReason({ amount: 7000, payerPhone: '+22670123456', externalId: 'PP1' }, 'Orange Money'), /Orange Money : 7\s000 F reçus du \+22670123456, transaction PP1/);
});

test('adresse des SMS : clé secrète d’au moins 24 caractères, comparée exactement', () => {
  const key = 'k'.repeat(32);
  assert.equal(smsKeyMatches(key, key), true);
  assert.equal(smsKeyMatches(`${key}x`, key), false);
  assert.equal(smsKeyMatches('', key), false);
  assert.equal(smsKeyMatches(undefined, key), false);
  assert.equal(smsKeyMatches('court', 'court'), false); // clé trop courte sur le serveur : adresse fermée
  assert.equal(smsKeyMatches('x', ''), false); // pas de clé réglée : adresse fermée
  assert.deepEqual(smsBodySchema.parse({ from: 'OrangeMoney', text: 'abc', sentStamp: 1 }), { sender: 'OrangeMoney', text: 'abc' });
  assert.deepEqual(smsBodySchema.parse({ sender: 'MoovMoney', message: 'abc' }), { sender: 'MoovMoney', text: 'abc' });
  assert.equal(smsBodySchema.safeParse({ from: 'OrangeMoney' }).success, false);
  // « Transitaire SMS » : {"from":"{in-number}","text":"{msg}"}, sans heure (heure = arrivée sur le serveur)
  assert.deepEqual(smsBodySchema.parse({ from: 'OrangeMoney', text: 'Vous avez reçu 7 000 FCFA' }), { sender: 'OrangeMoney', text: 'Vous avez reçu 7 000 FCFA' });
});

test('Ligdicash (préparé) : facture du montant des plats, référence de la commande, adresse de retour', () => {
  assert.equal(ligdicashReady({ ligdicashApiKey: '', ligdicashApiToken: '' }), false);
  assert.equal(ligdicashReady({ ligdicashApiKey: 'a', ligdicashApiToken: 'b' }), true);
  assert.equal(CREATE_URL, 'https://app.ligdicash.com/pay/v01/redirect/checkout-invoice/create');
  assert.equal(CONFIRM_URL, 'https://app.ligdicash.com/pay/v01/redirect/checkout-invoice/confirm/');
  const body = invoiceBody({ reference: 'BC-AAAAAA', itemsTotal: 7000 }, { siteUrl: 'https://site/', apiUrl: 'https://api' });
  assert.equal(body.commande.invoice.total_amount, 7000);
  assert.equal(body.commande.invoice.devise, 'XOF');
  assert.deepEqual(body.commande.custom_data, { transaction_id: 'BC-AAAAAA' });
  assert.equal(body.commande.actions.callback_url, 'https://api/api/paiements/ligdicash');
  assert.equal(body.commande.actions.return_url, 'https://site/suivi/BC-AAAAAA');
  assert.deepEqual(ligdicashHeaders({ ligdicashApiKey: 'K', ligdicashApiToken: 'T' }), { Apikey: 'K', Authorization: 'Bearer T', Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.deepEqual(readCreate({ response_code: '00', token: 'tok', response_text: 'https://app.ligdicash.com/pay/invoice/tok' }), { token: 'tok', url: 'https://app.ligdicash.com/pay/invoice/tok' });
  assert.match(readCreate({ response_code: '01', token: '', response_text: 'Echec (Code00)' }).error, /Code00/);
});

test('Ligdicash : le message reçu n’est jamais cru ; seule la vérification « completed » au bon montant valide', () => {
  const custom = [{ keyof_customdata: 'hash', valueof_customdata: 'x' }, { keyof_customdata: 'transaction_id', valueof_customdata: 'bc-aaaaaa' }];
  assert.equal(callbackReference({ custom_data: custom }), 'BC-AAAAAA');
  assert.equal(callbackReference({ custom_data: JSON.stringify(custom) }), 'BC-AAAAAA'); // envoyé en formulaire
  assert.equal(callbackReference({ custom_data: { transaction_id: 'BC-AAAAAA' } }), 'BC-AAAAAA');
  assert.equal(callbackReference({}), null);
  const o = { itemsTotal: 7000 };
  assert.deepEqual(readConfirm({ response_code: '00', status: 'completed', amount: 7000, customer: '22670123456', oreference: 'OR1', operator_name: 'Orange' }, o), { paid: true, phone: '+22670123456', operatorRef: 'OR1', operatorName: 'Orange' });
  assert.equal(readConfirm({ response_code: '00', status: 'pending', amount: 7000 }, o).pending, true);
  assert.equal(readConfirm({ response_code: '00', status: 'notcompleted', amount: 7000 }, o).paid, false);
  assert.match(readConfirm({ response_code: '00', status: 'completed', amount: 6000 }, o).reason, /montant/);
  assert.equal(readConfirm({ response_code: '01', response_text: 'Echec' }, o).paid, false);
  assert.equal(readConfirm(null, o).paid, false);
});
