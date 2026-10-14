// Mode « Livreurs indépendants » (interrupteur LIVREURS_INDEPENDANTS, fermé par défaut).
// 1. Interrupteur fermé : rien ne change pour les modes Restaurant et Prestataire.
// 2. Mode Indépendants : aucun montant de livraison nulle part, seulement la course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featureMap } from '../src/services/features.js';
import { companyUpdateError, effectiveMode, OPERATORS } from '../src/services/delivery-mode.js';
import {
  deliveryError, feeMethodError, feeToCollect, flowKey, isIndependentDelivery, nextStatus, paymentConfirmError,
} from '../src/services/order-status.js';
import { feeEditRight, INDEPENDENT_GRID } from '../src/services/delivery-fees.js';
import {
  currentMessageKey, customerMessage, INDEPENDENT_LINE, MESSAGES, messageModel, noticeState, renderMessage,
} from '../src/services/customer-messages.js';
import { feeCounted } from '../src/services/dashboard.js';
import { restaurantFees } from '../src/services/sales.js';
import { toCourse } from '../src/services/courier.js';
import { courierTeamError, TEAM_LABEL } from '../src/services/courier-team.js';
import { toPublicOrder } from '../src/services/order.service.js';
import { createMemberSchema, independentMemberError } from '../src/services/team.js';

const PAYMENT = { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*11*MONTANT#', MOOV_MONEY: '*2*22*MONTANT#', TELECEL_MONEY: '*3*33*MONTANT#' } };
const ctx = { siteUrl: 'https://belchicken-six.vercel.app', payment: PAYMENT, restaurantAddress: 'Kamsonghin', restaurantMapsUrl: 'https://maps' };
const READY = { mode: 'PRESTATAIRE', companyName: 'Notre société', merchantName: 'NOUS', orangeCode: '*144*1*MONTANT#', moovCode: '*555*1*MONTANT#', telecelCode: '*800*1*MONTANT#' };
const order = (extra = {}) => ({
  id: 'o1', reference: 'BC-7K2Q9M', mode: 'LIVRAISON', customerName: 'awa Traoré', customerPhone: '+22676123456', paymentMethod: 'ORANGE_MONEY',
  itemsTotal: 7000, deliveryFee: null, deliveryFeeMethod: null, deliveryFeeVerifiedAt: null, status: 'PAYEE', deliveryOperator: 'RESTAURANT',
  items: [], statusChanges: [], events: [], ...extra,
});
const indep = (extra = {}) => order({ deliveryOperator: 'INDEPENDANT', ...extra });

// ─── 1. Interrupteur fermé : rien ne change ───

test('interrupteur LIVREURS_INDEPENDANTS : fermé sans ligne, ouvert seulement par le Prestataire', () => {
  assert.equal(featureMap([]).LIVREURS_INDEPENDANTS, false);
  assert.equal(featureMap([{ key: 'LIVREURS_INDEPENDANTS', enabled: true }]).LIVREURS_INDEPENDANTS, true);
});

test('interrupteur fermé : le mode Indépendants est refusé, et un mode déjà enregistré compte comme Restaurant', () => {
  assert.ok(OPERATORS.includes('INDEPENDANT'));
  assert.match(companyUpdateError({ mode: 'INDEPENDANT' }), /pas inclus/);
  assert.match(companyUpdateError({ mode: 'INDEPENDANT' }, { independentOpen: false, previousMode: 'RESTAURANT' }), /pas inclus/);
  assert.equal(effectiveMode({ mode: 'INDEPENDANT' }), 'RESTAURANT');
  assert.equal(effectiveMode({ mode: 'INDEPENDANT' }, { independentOpen: false }), 'RESTAURANT');
});

test('interrupteur fermé : modes Restaurant et Prestataire exactement comme avant', () => {
  assert.equal(effectiveMode({ mode: 'RESTAURANT' }), 'RESTAURANT');
  assert.equal(effectiveMode(READY), 'PRESTATAIRE');
  assert.equal(effectiveMode({ ...READY, moovCode: null }), 'RESTAURANT');
  assert.equal(effectiveMode(null), 'RESTAURANT');
  assert.equal(companyUpdateError({ mode: 'RESTAURANT' }), null);
  assert.equal(companyUpdateError(READY), null);
  // Frais toujours demandés en mode Restaurant
  assert.match(paymentConfirmError(null), /Indiquez les frais/);
  assert.equal(paymentConfirmError(1000), null);
  assert.match(deliveryError(order({ deliveryFee: null })), /Saisissez d’abord les frais/);
  assert.equal(feeToCollect(order({ deliveryFee: 1000, status: 'EN_LIVRAISON' })), true);
  assert.match(feeMethodError(order({ deliveryFee: 1000, status: 'EN_LIVRAISON' }), null), /espèces ou mobile money/);
  assert.equal(feeEditRight(order({ status: 'PAYEE' })).who, 'TOUS');
  assert.equal(flowKey('LIVRAISON', 'RESTAURANT'), 'LIVRAISON');
  assert.equal(flowKey('LIVRAISON', 'PRESTATAIRE'), 'PARTENAIRE');
});

test('interrupteur fermé : messages au client des modes Restaurant et Prestataire inchangés', () => {
  const o = order({ deliveryFee: 1000, status: 'EN_PREPARATION' });
  // Même texte avec ou sans le champ deliveryOperator (commandes d'avant le lot 5)
  const { deliveryOperator, ...old } = o;
  assert.equal(deliveryOperator, 'RESTAURANT');
  assert.equal(renderMessage('EN_PREPARATION', o, ctx), renderMessage('EN_PREPARATION', old, ctx));
  assert.equal(messageModel('EN_PREPARATION', o, ctx).template, 'commande_en_preparation');
  assert.equal(messageModel('EN_PREPARATION', order({ deliveryFee: 0 }), ctx).template, 'commande_en_preparation_offerte');
  assert.ok(!renderMessage('EN_PREPARATION', o, ctx).includes(INDEPENDENT_LINE));
  assert.deepEqual(currentMessageKey(order({ deliveryFee: null })), { key: 'PAIEMENT_CONFIRME', missing: 'Saisissez d’abord les frais de livraison.' });
  const partner = { ...o, deliveryOperator: 'PRESTATAIRE' };
  assert.equal(messageModel('EN_PREPARATION', partner, ctx).template, 'commande_en_preparation');
});

test('interrupteur fermé : réponses publiques inchangées (pas de champ « indépendant »)', () => {
  const pub = toPublicOrder(order({ deliveryFee: 1000 }), ctx);
  assert.equal('independentDelivery' in pub, false);
  assert.ok(pub.feePayment);
  const course = toCourse(order({ status: 'EN_LIVRAISON', deliveryFee: 1000, deliveryCodeAttempts: 0 }));
  assert.equal('independent' in course, false);
  assert.equal(course.deliveryFee, 1000);
});

test('Patron : un Livreur indépendant est refusé tant que l’interrupteur est fermé', () => {
  assert.equal(independentMemberError({ role: 'LIVREUR' }, false), null); // compte d'avant : rien demandé
  assert.match(independentMemberError({ role: 'LIVREUR', independent: true }, false), /pas inclus/);
  assert.match(independentMemberError({ role: 'OPERATEUR', independent: true }, true), /Seul un compte Livreur/);
  assert.equal(independentMemberError({ role: 'LIVREUR', independent: true }, true), null);
  const parsed = createMemberSchema.parse({ role: 'LIVREUR', name: 'Issa', phone: '76123456', password: 'motdepasse1' });
  assert.equal(parsed.independent, undefined);
});

// ─── 2. Mode Indépendants : seulement la course ───

test('interrupteur ouvert : le mode Indépendants peut être choisi, sans société ni codes', () => {
  assert.equal(companyUpdateError({ mode: 'INDEPENDANT' }, { independentOpen: true }), null);
  assert.equal(effectiveMode({ mode: 'INDEPENDANT' }, { independentOpen: true }), 'INDEPENDANT');
  // Déjà enregistré : les autres champs se changent encore, même interrupteur refermé
  assert.equal(companyUpdateError({ mode: 'INDEPENDANT' }, { previousMode: 'INDEPENDANT' }), null);
});

test('indépendants : même parcours que la livraison par le restaurant', () => {
  assert.equal(flowKey('LIVRAISON', 'INDEPENDANT'), 'LIVRAISON');
  assert.equal(nextStatus('EN_PREPARATION', 'LIVRAISON', 'INDEPENDANT'), 'EN_LIVRAISON');
  assert.equal(isIndependentDelivery(indep()), true);
  assert.equal(isIndependentDelivery(indep({ mode: 'A_EMPORTER' })), false);
});

test('indépendants : aucun frais à saisir, à encaisser ni à corriger', () => {
  assert.equal(paymentConfirmError(null, 'LIVRAISON', null, 'INDEPENDANT'), null);
  assert.match(paymentConfirmError(1000, 'LIVRAISON', null, 'INDEPENDANT'), /directement entre le client et le livreur/);
  assert.equal(deliveryError(indep({ status: 'EN_PREPARATION' })), null);
  assert.equal(feeToCollect(indep({ status: 'EN_LIVRAISON' })), false);
  assert.equal(feeMethodError(indep({ status: 'EN_LIVRAISON' }), undefined), null);
  for (const status of ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE']) {
    assert.equal(feeEditRight(indep({ status })).who, null, status);
  }
});

test('indépendants : messages au client avec la phrase des indépendants, sans montant ni code marchand', () => {
  for (const [key, status] of [['PAIEMENT_CONFIRME', 'PAYEE'], ['EN_PREPARATION', 'EN_PREPARATION'], ['EN_ROUTE', 'EN_LIVRAISON']]) {
    const o = indep({ status, deliveryCode: '0427' });
    const text = renderMessage(key, o, ctx);
    assert.ok(text.includes(INDEPENDENT_LINE), key);
    assert.ok(!/code marchand|ECOFOOD|\*144|MONTANT|Livraison offerte/.test(text), key);
    assert.match(messageModel(key, o, ctx).template, /_independant$/);
  }
  assert.ok(renderMessage('EN_ROUTE', indep({ status: 'EN_LIVRAISON', deliveryCode: '0427' }), ctx).includes('0427')); // code de remise gardé
  assert.ok(renderMessage('PAIEMENT_PREPARATION', indep({ status: 'EN_PREPARATION', shortFlow: true }), ctx).includes(INDEPENDENT_LINE));
  assert.equal(INDEPENDENT_LINE, 'Frais de livraison : à régler directement au livreur, à la réception. Ils ne sont pas compris dans votre paiement.');
  // Aucun frais attendu avant de prévenir le client
  assert.deepEqual(currentMessageKey(indep()), { key: 'PAIEMENT_CONFIRME' });
  assert.equal(noticeState(indep()).missing, undefined);
  assert.ok(customerMessage(indep(), ctx).url.startsWith('https://wa.me/22676123456'));
  // Chaque message avec des frais a sa version « indépendant »
  for (const m of Object.values(MESSAGES)) if (m.free) assert.ok(m.independent?.body.includes(INDEPENDENT_LINE));
});

test('indépendants : rien dans la Caisse, les ventes ni le tableau de bord', () => {
  // Même une commande mal remplie (frais et mode de paiement) n'est jamais comptée
  const odd = indep({ status: 'LIVREE', deliveryFee: 1000, deliveryFeeMethod: 'ESPECES' });
  assert.equal(feeCounted(odd), false);
  assert.deepEqual(restaurantFees([odd, indep({ status: 'LIVREE' })]).count, 0);
  assert.equal(restaurantFees([order({ status: 'LIVREE', deliveryFee: 1000, deliveryFeeMethod: 'ESPECES' })]).count, 1);
  // Caisse et relevé : les requêtes ne prennent que leur propre mode (RESTAURANT, PRESTATAIRE), jamais INDEPENDANT
  const cash = readFileSync(new URL('../src/services/cash.js', import.meta.url), 'utf8');
  assert.match(cash, /CASH_OPERATORS = \['RESTAURANT', 'PRESTATAIRE'\]/);
  const statement = readFileSync(new URL('../src/services/statement.service.js', import.meta.url), 'utf8');
  assert.match(statement, /deliveryOperator: 'PRESTATAIRE'/);
});

test('indépendants : le livreur voit sa course sans frais à encaisser', () => {
  const course = toCourse(indep({ status: 'EN_LIVRAISON', deliveryCode: '0427', deliveryCodeAttempts: 0 }));
  assert.equal(course.independent, true);
  assert.equal(course.deliveryFee, null);
  assert.equal(course.hasCode, true);
  assert.equal('deliveryCode' in course, false);
});

test('indépendants : seulement des livreurs indépendants pour ces commandes', () => {
  const c = (courierTeam) => ({ name: 'Issa', courierTeam });
  assert.equal(TEAM_LABEL.INDEPENDANT, 'Indépendant');
  assert.equal(courierTeamError(indep(), c('INDEPENDANT'), false), null);
  assert.match(courierTeamError(indep(), c('RESTAURANT'), false), /livreur indépendant/);
  assert.match(courierTeamError(order(), c('INDEPENDANT'), false), /livreur du restaurant/);
  assert.match(courierTeamError(order({ deliveryOperator: 'PRESTATAIRE' }), c('INDEPENDANT'), false), /notre partenaire/);
});

test('indépendants : site client sans prix, avec la phrase des indépendants', () => {
  assert.deepEqual({ ...INDEPENDENT_GRID }, { active: false, zones: [], gps: false, allowOther: true, independent: true });
  const pub = toPublicOrder(indep({ status: 'EN_LIVRAISON' }), ctx);
  assert.equal(pub.independentDelivery, true);
  assert.equal(pub.feePayment, null);
  assert.equal(pub.deliveryFee, null);
  assert.equal('independentDelivery' in toPublicOrder(indep({ mode: 'A_EMPORTER' }), ctx), false);
});
