// Lot 5a : livraison en deux modes, fondations (règles sans base de données)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCompanyInput, companyChanges, companyPayment, companyReady, companyUpdateError, DEFAULT_COMPANY, effectiveMode, feePaymentOf,
  joinFr, missingForPrestataire,
} from '../src/services/delivery-mode.js';
import { feeSentence, MESSAGES, renderMessage } from '../src/services/customer-messages.js';
import { toPublicOrder } from '../src/services/order.service.js';
import { toStaffOrder } from '../src/services/staff-orders.service.js';
import { accessFor } from '../src/middlewares/staff-auth.js';

const ECOFOOD = { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*11*MONTANT#', MOOV_MONEY: '*2*22*MONTANT#', TELECEL_MONEY: '*3*33*MONTANT#' } };
const OURS = {
  mode: 'PRESTATAIRE', companyName: 'Livraisons Express', merchantName: 'LIVEXPRESS',
  orangeCode: '*144*10*99999999*MONTANT#', moovCode: '*555*4*1*8888888*MONTANT#', telecelCode: '*808*4*1*7777777*MONTANT#',
};
const ctx = (extra = {}) => ({ siteUrl: 'https://belchicken-six.vercel.app', payment: ECOFOOD, ...extra });
const order = (extra = {}) => ({
  reference: 'BC-7K2Q9M', customerName: 'awa Traoré', customerPhone: '+22676123456', paymentMethod: 'ORANGE_MONEY', mode: 'LIVRAISON',
  itemsTotal: 7000, deliveryFee: 1000, deliveryFeeMethod: null, status: 'PAYEE', ...extra,
});

test('sans réglage : mode Restaurant, rien de rempli', () => {
  assert.equal(effectiveMode(DEFAULT_COMPANY), 'RESTAURANT');
  assert.equal(effectiveMode(null), 'RESTAURANT');
  assert.equal(companyReady(DEFAULT_COMPANY), false);
  assert.deepEqual(missingForPrestataire(DEFAULT_COMPANY), [
    'le nom de la société', 'le nom affiché au client', 'le code Orange Money', 'le code Moov Money', 'le code Telecel Money',
  ]);
});

test('mode Prestataire refusé tant que nos codes sont vides', () => {
  const error = companyUpdateError({ ...DEFAULT_COMPANY, mode: 'PRESTATAIRE' });
  assert.match(error, /^Le mode Prestataire ne peut pas être activé : il manque le nom de la société, .* et le code Telecel Money\.$/);
  assert.match(companyUpdateError({ ...OURS, telecelCode: null }), /il manque le code Telecel Money\./);
  assert.equal(companyUpdateError(OURS), null);
  assert.equal(companyUpdateError({ ...OURS, mode: 'AUTRE' }), 'Mode de livraison inconnu.');
});

test('mode Restaurant : codes remplis petit à petit, vides permis, mais jamais un code mal écrit', () => {
  assert.equal(companyUpdateError({ ...DEFAULT_COMPANY, orangeCode: '*144*10*99999999*MONTANT#' }), null);
  assert.match(companyUpdateError({ ...DEFAULT_COMPANY, orangeCode: '*144*10*99999999*1000#' }), /^Code Orange Money invalide/);
  assert.match(companyUpdateError({ ...DEFAULT_COMPANY, moovCode: '0102030405' }), /^Code Moov Money invalide/);
  assert.match(companyUpdateError({ ...DEFAULT_COMPANY, companyName: 'x'.repeat(81) }), /80 caractères au plus/);
});

test('par sécurité, un mode Prestataire incomplet en base reste Restaurant pour les nouvelles commandes', () => {
  assert.equal(effectiveMode(OURS), 'PRESTATAIRE');
  assert.equal(effectiveMode({ ...OURS, moovCode: null }), 'RESTAURANT');
  assert.equal(effectiveMode({ ...OURS, moovCode: 'faux' }), 'RESTAURANT');
});

test('commandes qui attendent leurs frais sur nos codes : codes et nom ne peuvent pas être vidés', () => {
  const back = { ...OURS, mode: 'RESTAURANT' };
  assert.equal(companyUpdateError(back, { awaitingFees: 2 }), null); // retour au mode Restaurant : permis, codes gardés
  assert.equal(
    companyUpdateError({ ...back, orangeCode: null }, { awaitingFees: 2 }),
    '2 commandes livrées par notre équipe attendent encore leurs frais : nos codes et notre nom ne peuvent pas être vidés.',
  );
  assert.match(companyUpdateError({ ...back, merchantName: null }, { awaitingFees: 1 }), /^1 commande livrée par notre équipe attend encore/);
  assert.equal(companyUpdateError({ ...back, orangeCode: null }, { awaitingFees: 0 }), null);
});

test('saisie nettoyée : espaces retirés, vide = null, champs absents inchangés', () => {
  assert.deepEqual(cleanCompanyInput({ companyName: '  Livraisons   Express ', orangeCode: ' *144*10 * 9999*MONTANT# ', moovCode: '   ' }), {
    companyName: 'Livraisons Express', orangeCode: '*144*10*9999*MONTANT#', moovCode: null,
  });
  assert.deepEqual(cleanCompanyInput({ mode: 'PRESTATAIRE' }), { mode: 'PRESTATAIRE' });
  assert.deepEqual(cleanCompanyInput({}), {});
});

test('journal : une ligne lisible par changement', () => {
  assert.deepEqual(companyChanges(DEFAULT_COMPANY, OURS), [
    'Mode : Restaurant → Prestataire',
    'Société : vide → Livraisons Express',
    'Nom affiché : vide → LIVEXPRESS',
    'Code Orange Money : vide → *144*10*99999999*MONTANT#',
    'Code Moov Money : vide → *555*4*1*8888888*MONTANT#',
    'Code Telecel Money : vide → *808*4*1*7777777*MONTANT#',
  ]);
  assert.deepEqual(companyChanges(OURS, OURS), []);
  assert.equal(joinFr(['a']), 'a');
  assert.equal(joinFr(['a', 'b', 'c']), 'a, b et c');
});

test('codes des frais : ECOFOOD pour une commande Restaurant (et les anciennes), les nôtres en mode Prestataire', () => {
  const ours = companyPayment(OURS);
  assert.equal(feePaymentOf(order(), ctx()), ECOFOOD); // anciennes commandes : pas de deliveryOperator
  assert.equal(feePaymentOf(order({ deliveryOperator: 'RESTAURANT' }), ctx({ prestatairePayment: ours })), ECOFOOD);
  assert.equal(feePaymentOf(order({ deliveryOperator: 'PRESTATAIRE' }), ctx({ prestatairePayment: ours })), ours);
  // Jamais les codes ECOFOOD pour une commande Prestataire, même si nos codes n'ont pas été chargés
  assert.deepEqual(feePaymentOf(order({ deliveryOperator: 'PRESTATAIRE' }), ctx()).codes.ORANGE_MONEY, '-');
});

test('message « paiement confirmé » en mode Prestataire : nos codes et notre nom pour les frais, même modèle Meta', () => {
  const o = order({ deliveryOperator: 'PRESTATAIRE' });
  const text = renderMessage('PAIEMENT_CONFIRME', o, ctx({ prestatairePayment: companyPayment(OURS) }));
  assert.match(text, /nom affiché : LIVEXPRESS\) :\nOrange Money : ```\*144\*10\*99999999\*1000#```\nMoov Money : ```\*555\*4\*1\*8888888\*1000#```\nTelecel Money : ```\*808\*4\*1\*7777777\*1000#```/);
  assert.doesNotMatch(text, /ECOFOOD|\*1\*11\*/);
  assert.equal(MESSAGES.PAIEMENT_CONFIRME.template, 'commande_paiement_confirme');
  // Mode Restaurant : exactement comme avant
  const before = renderMessage('PAIEMENT_CONFIRME', order(), ctx());
  assert.equal(renderMessage('PAIEMENT_CONFIRME', order({ deliveryOperator: 'RESTAURANT' }), ctx({ prestatairePayment: companyPayment(OURS) })), before);
  assert.match(before, /nom affiché : ECOFOOD\) :\nOrange Money : ```\*1\*11\*1000#```/);
});

test('message « en route » en mode Prestataire : code de remise inchangé, frais sur nos codes', () => {
  const o = order({ deliveryOperator: 'PRESTATAIRE', status: 'EN_LIVRAISON', deliveryCode: '0427' });
  const text = renderMessage('EN_ROUTE', o, ctx({ prestatairePayment: companyPayment(OURS) }));
  assert.match(text, /0427/);
  assert.match(text, /LIVEXPRESS/);
  // Livraison offerte : aucun code, dans les deux modes
  assert.equal(feeSentence({ ...o, deliveryFee: 0 }, ctx({ prestatairePayment: companyPayment(OURS) })), 'Livraison offerte : vous n’avez rien à payer au livreur.');
});

test('page de suivi : codes des frais selon le mode de la commande ; le paiement des plats ne change pas', () => {
  const base = { ...order({ status: 'EN_PREPARATION' }), createdAt: new Date(), items: [], statusChanges: [] };
  const restaurant = toPublicOrder(base, ctx());
  assert.equal(restaurant.feePayment.merchantName, 'ECOFOOD');
  assert.equal(restaurant.feePayment.operator, 'RESTAURANT');
  assert.equal(restaurant.feePayment.operators[0].code, '*1*11*1000#');
  const prestataire = toPublicOrder({ ...base, deliveryOperator: 'PRESTATAIRE' }, ctx({ prestatairePayment: companyPayment(OURS) }));
  assert.equal(prestataire.feePayment.merchantName, 'LIVEXPRESS');
  assert.equal(prestataire.feePayment.operator, 'PRESTATAIRE');
  assert.equal(prestataire.feePayment.operators[2].code, '*808*4*1*7777777*1000#');
  assert.equal(prestataire.itemsTotal, 7000);
});

test('détail équipe : mode de la commande et message avec nos codes', () => {
  const o = {
    ...order({ deliveryOperator: 'PRESTATAIRE' }), id: 'o1', createdAt: new Date(), items: [], statusChanges: [], events: [],
    deliveryCodeAttempts: 0,
  };
  const staff = toStaffOrder(o, null, ctx({ prestatairePayment: companyPayment(OURS) }));
  assert.equal(staff.deliveryOperator, 'PRESTATAIRE');
  assert.match(staff.notice.text, /LIVEXPRESS/);
  const old = toStaffOrder({ ...o, deliveryOperator: undefined }, null, ctx());
  assert.equal(old.deliveryOperator, 'RESTAURANT');
  assert.match(old.notice.text, /ECOFOOD/);
});

test('réglage du mode : Prestataire seulement (ni Patron ni Opérateur)', () => {
  const roles = ['PRESTATAIRE'];
  assert.equal(accessFor({ role: 'PRESTATAIRE' }, roles), 'ok');
  assert.equal(accessFor({ role: 'PATRON' }, roles), 'refuse');
  assert.equal(accessFor({ role: 'OPERATEUR' }, roles), 'refuse');
  assert.equal(accessFor({ role: 'LIVREUR' }, roles), 'refuse');
});
