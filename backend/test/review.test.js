// Lot 7 : avis des clients (règles sans base de données, review.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  average, buildReviews, checkCallBack, checkReviewInput, distribution, forDeliveryManager, isLowRating, isReviewToken,
  lowDeliveryForPartner, newReviewToken, REVIEW_DAYS, reviewLinkActive, reviewsActive, reviewState, reviewUrl, toPublicReview,
} from '../src/services/review.js';
import { lowReviewNotification } from '../src/services/push.message.js';
import { featureMap } from '../src/services/features.js';
import { parsePeriod } from '../src/services/statement.js';

const NOW = new Date('2026-10-11T15:00:00Z');
const t = (day, hh = 12, mm = 0) => new Date(Date.UTC(2026, 9, day, hh, mm));

const delivered = (over = {}) => ({
  reference: 'BC-7K2Q9M',
  customerName: 'awa traoré',
  customerPhone: '+22670112233',
  mode: 'LIVRAISON',
  status: 'LIVREE',
  reviewToken: 'abcdefghijABCDEFGHIJ_-',
  review: null,
  statusChanges: [{ toStatus: 'EN_LIVRAISON', createdAt: t(10, 13) }, { toStatus: 'LIVREE', createdAt: t(10, 14) }],
  ...over,
});

test('lien : 22 caractères au hasard, jamais deux fois le même, sans la référence', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const k = newReviewToken();
    assert.ok(isReviewToken(k), k);
    seen.add(k);
  }
  assert.equal(seen.size, 2000);
  assert.equal(isReviewToken('BC-7K2Q9M'), false);
  assert.equal(isReviewToken('abc'), false);
  assert.equal(isReviewToken('abcdefghijABCDEFGHIJ_/'), false);
  assert.equal(reviewUrl('abcdefghijABCDEFGHIJ_-', { siteUrl: 'https://belchicken-six.vercel.app/' }), 'https://belchicken-six.vercel.app/avis/abcdefghijABCDEFGHIJ_-');
});

test('actifs seulement si AVIS est ouvert ET le réglage du Patron allumé ; AVIS ouvert sans ligne', () => {
  assert.equal(featureMap([]).AVIS, true);
  assert.equal(reviewsActive({ avisOpen: true, reviewsEnabled: true }), true);
  assert.equal(reviewsActive({ avisOpen: true, reviewsEnabled: false }), false);
  assert.equal(reviewsActive({ avisOpen: false, reviewsEnabled: true }), false);
});

test('page publique : à donner, déjà donné, fermé, expiré, inconnu', () => {
  assert.equal(reviewState(delivered(), { avisOpen: true, now: NOW }), 'A_DONNER');
  assert.equal(reviewState(delivered({ review: { id: 'r1' } }), { avisOpen: true, now: NOW }), 'DEJA_DONNE');
  assert.equal(reviewState(delivered(), { avisOpen: false, now: NOW }), 'FERME');
  // 7 jours après la livraison : encore bon ; une minute de plus : expiré
  const limit = new Date(t(10, 14).getTime() + REVIEW_DAYS * 86400000);
  assert.equal(reviewState(delivered(), { avisOpen: true, now: limit }), 'A_DONNER');
  assert.equal(reviewState(delivered(), { avisOpen: true, now: new Date(limit.getTime() + 60000) }), 'EXPIRE');
  // Pas livrée, ou sans clé : comme un lien inconnu
  assert.equal(reviewState(delivered({ status: 'ANNULEE' }), { avisOpen: true, now: NOW }), null);
  assert.equal(reviewState(delivered({ reviewToken: null }), { avisOpen: true, now: NOW }), null);
  assert.equal(reviewState(null, { avisOpen: true, now: NOW }), null);
});

test('page publique : prénom, référence et livraison ou non, jamais le téléphone ni les montants', () => {
  const page = toPublicReview({ ...delivered(), itemsTotal: 9000, deliveryFee: 1000 }, 'A_DONNER');
  assert.deepEqual(page, { reference: 'BC-7K2Q9M', firstName: 'Awa', delivery: true, state: 'A_DONNER' });
  assert.equal(toPublicReview(delivered({ mode: 'A_EMPORTER' }), 'A_DONNER').delivery, false);
});

test('lien dans le remerciement : clé, AVIS ouvert, livrée, 7 jours au plus', () => {
  assert.equal(reviewLinkActive(delivered(), { avisOpen: true, now: NOW }), true);
  assert.equal(reviewLinkActive(delivered(), { avisOpen: false, now: NOW }), false);
  assert.equal(reviewLinkActive(delivered({ reviewToken: null }), { avisOpen: true, now: NOW }), false);
  assert.equal(reviewLinkActive(delivered(), { avisOpen: true, now: t(18, 15) }), false);
  // Avis déjà donné : le message ne change pas
  assert.equal(reviewLinkActive(delivered({ review: { id: 'r1' } }), { avisOpen: true, now: NOW }), true);
});

test('avis envoyé : trois notes pour une livraison, deux pour une commande à emporter', () => {
  const ok = checkReviewInput({ callCenter: 5, food: 4, delivery: 3, comment: '  Très bon,\n merci  ' }, { mode: 'LIVRAISON' });
  assert.deepEqual(ok.data, { callCenterRating: 5, foodRating: 4, deliveryRating: 3, comment: 'Très bon, merci', lowRating: false });
  assert.match(checkReviewInput({ callCenter: 5, food: 4 }, { mode: 'LIVRAISON' }).error, /livreur/);
  const pickup = checkReviewInput({ callCenter: 5, food: 5, comment: '' }, { mode: 'A_EMPORTER' });
  assert.deepEqual(pickup.data, { callCenterRating: 5, foodRating: 5, deliveryRating: null, comment: null, lowRating: false });
  assert.match(checkReviewInput({ callCenter: 5, food: 5, delivery: 4 }, { mode: 'A_EMPORTER' }).error, /à emporter/);
});

test('avis envoyé : notes de 1 à 5 entières, commentaire de 500 caractères au plus, rien d’autre', () => {
  const base = { callCenter: 5, food: 5, delivery: 5 };
  for (const bad of [0, 6, 2.5, '5', null, -1]) {
    assert.ok(checkReviewInput({ ...base, food: bad }, { mode: 'LIVRAISON' }).error, String(bad));
  }
  assert.ok(checkReviewInput({ food: 5, delivery: 5 }, { mode: 'LIVRAISON' }).error);
  assert.ok(checkReviewInput({ ...base, comment: 'x'.repeat(501) }, { mode: 'LIVRAISON' }).error);
  assert.equal(checkReviewInput({ ...base, comment: 'x'.repeat(500) }, { mode: 'LIVRAISON' }).error, undefined);
  // Champ inconnu (ex. une autre commande) : refusé
  assert.ok(checkReviewInput({ ...base, orderId: 'x' }, { mode: 'LIVRAISON' }).error);
  assert.ok(checkReviewInput(null, { mode: 'LIVRAISON' }).error);
});

test('mauvais avis : une des notes à 2 ou moins', () => {
  assert.equal(isLowRating({ callCenterRating: 3, foodRating: 3, deliveryRating: 3 }), false);
  assert.equal(isLowRating({ callCenterRating: 2, foodRating: 5, deliveryRating: 5 }), true);
  assert.equal(isLowRating({ callCenterRating: 5, foodRating: 1, deliveryRating: null }), true);
  assert.equal(isLowRating({ callCenterRating: 5, foodRating: 5, deliveryRating: 2 }), true);
  assert.equal(checkReviewInput({ callCenter: 5, food: 5, delivery: 2 }, { mode: 'LIVRAISON' }).data.lowRating, true);
});

test('moyennes et répartition', () => {
  assert.equal(average([5, 4, 4]), 4.3);
  assert.equal(average([null, 3]), 3);
  assert.equal(average([]), null);
  assert.deepEqual(distribution([5, 5, 1, 3]), [1, 0, 1, 0, 2]);
});

// Avis d'essai : commande vérifiée par Awa ou Moussa, livrée par Issa (restaurant) ou Ali (notre équipe)
let n = 0;
function review({ cc = 5, food = 5, del = 5, day = 9, agent = 'awa', courier = 'issa', operator = 'RESTAURANT', mode = 'LIVRAISON', comment = null, called = null } = {}) {
  n += 1;
  const r = { callCenterRating: cc, foodRating: food, deliveryRating: mode === 'A_EMPORTER' ? null : del };
  return {
    id: `r${n}`,
    ...r,
    comment,
    lowRating: isLowRating(r),
    calledBackAt: called ? t(day, 18) : null,
    calledBackByName: called,
    calledBackNote: null,
    createdAt: t(day, 15, n),
    order: {
      reference: `BC-T${n}`,
      mode,
      deliveryOperator: operator,
      customerName: 'Awa Traoré',
      customerPhone: '+22670112233',
      itemsTotal: 9000,
      courierId: mode === 'A_EMPORTER' ? null : courier,
      courierName: mode === 'A_EMPORTER' ? null : { issa: 'Issa', ali: 'Ali' }[courier],
      statusChanges: agent ? [{ toStatus: 'PAYEE', staffUserId: agent, staffName: agent === 'awa' ? 'Awa' : 'Moussa', createdAt: t(day, 12) }] : [],
    },
  };
}

test('page Avis du Patron : moyennes, par agent (paiement vérifié), par livreur, à rappeler', () => {
  const period = parsePeriod('2026-10-01', '2026-10-11', NOW);
  const list = [
    review({ cc: 5, food: 4, del: 5 }),
    review({ cc: 3, food: 5, del: 2, comment: 'Livreur en retard' }),
    review({ cc: 4, food: 4, agent: 'moussa', mode: 'A_EMPORTER' }),
    review({ cc: 5, food: 5, del: 4, courier: 'ali', operator: 'PRESTATAIRE' }),
  ];
  const s = buildReviews(list, period, { toCall: list.filter((r) => r.lowRating && !r.calledBackAt) });
  assert.equal(s.count, 4);
  assert.equal(s.lowCount, 1);
  assert.equal(s.criteria.callCenter.average, 4.3);
  assert.equal(s.criteria.food.average, 4.5);
  assert.equal(s.criteria.delivery.count, 3); // pas de note de livraison à emporter
  assert.equal(s.criteria.delivery.average, 3.7);
  assert.deepEqual(s.byAgent.map((a) => [a.name, a.count, a.average]), [['Moussa', 1, 4], ['Awa', 3, 4.3]]);
  assert.deepEqual(s.byCourier.map((c) => [c.name, c.team, c.count, c.average]), [['Issa', 'RESTAURANT', 2, 3.5], ['Ali', 'PRESTATAIRE', 1, 4]]);
  assert.equal(s.toCall.length, 1);
  assert.equal(s.toCall[0].customerPhone, '+22670112233');
  assert.equal(s.toCall[0].comment, 'Livreur en retard');
  assert.equal(s.list[0].reference, 'BC-T4'); // le plus récent d'abord
  assert.equal(s.list.find((r) => r.mode === 'A_EMPORTER').courierName, null);
});

test('Responsable livraison : note de livraison de notre équipe seulement, rien d’autre', () => {
  const period = parsePeriod('2026-10-01', '2026-10-11', NOW);
  const list = [
    review({ cc: 1, food: 1, del: 5, comment: 'Nourriture froide' }), // restaurant : jamais vue
    review({ cc: 2, food: 3, del: 2, courier: 'ali', operator: 'PRESTATAIRE', comment: 'Livreur impoli, call center lent' }),
    review({ cc: 5, food: 5, del: 4, courier: 'ali', operator: 'PRESTATAIRE' }),
    review({ mode: 'A_EMPORTER', operator: 'PRESTATAIRE' }),
  ];
  const s = forDeliveryManager(list, period);
  assert.equal(s.count, 2);
  assert.equal(s.average, 3);
  assert.equal(s.lowCount, 1);
  assert.deepEqual(s.byCourier.map((c) => [c.name, c.count, c.average]), [['Ali', 2, 3]]);
  assert.deepEqual(Object.keys(s.list[0]).sort(), ['at', 'courierName', 'delivery', 'id', 'reference']);
  // Ni les autres notes, ni les commentaires, ni le client, ni l'agent, ni aucun montant
  const text = JSON.stringify(s);
  for (const word of ['callCenter', 'food', 'comment', 'Nourriture', 'impoli', 'customer', 'Traoré', '22670112233', 'Awa', 'Moussa', 'itemsTotal', '9000']) {
    assert.ok(!text.includes(word), word);
  }
});

test('alertes de mauvais avis : Patron (les mauvaises notes), Responsable (livraison de notre équipe)', () => {
  const r = { callCenterRating: 2, foodRating: 4, deliveryRating: 1 };
  const order = { reference: 'BC-7K2Q9M', mode: 'LIVRAISON', deliveryOperator: 'PRESTATAIRE', courierName: 'Ali', customerName: 'Awa', customerPhone: '+22670112233' };
  const patron = lowReviewNotification(order, r);
  assert.equal(patron.title, 'Mauvais avis · BC-7K2Q9M');
  assert.equal(patron.body, 'Call center : 2/5 · Livraison : 1/5. Rappelez le client.');
  assert.equal(patron.url, '/equipe/avis');
  const partner = lowReviewNotification(order, r, { forPartner: true });
  assert.equal(partner.body, 'Livraison : 1/5 · Ali.');
  for (const n of [patron, partner]) assert.ok(!JSON.stringify(n).includes('Awa') && !JSON.stringify(n).includes('22670112233'));
  assert.ok(!JSON.stringify(partner).includes('Call center'));
  assert.equal(lowDeliveryForPartner(r, order), true);
  assert.equal(lowDeliveryForPartner(r, { ...order, deliveryOperator: 'RESTAURANT' }), false);
  assert.equal(lowDeliveryForPartner({ ...r, deliveryRating: 3 }, order), false);
});

test('client rappelé : seulement un mauvais avis, une seule fois, note courte', () => {
  const staff = { id: 's1', name: 'Patron' };
  const low = { lowRating: true, calledBackAt: null };
  const ok = checkCallBack({ note: ' Client rassuré,  bon offert ' }, low, staff, NOW);
  assert.deepEqual(ok.data, { calledBackAt: NOW, calledBackById: 's1', calledBackByName: 'Patron', calledBackNote: 'Client rassuré, bon offert' });
  assert.equal(checkCallBack({}, low, staff, NOW).data.calledBackNote, null);
  assert.ok(checkCallBack({}, { lowRating: false }, staff).error);
  assert.match(checkCallBack({}, { lowRating: true, calledBackAt: NOW, calledBackByName: 'Awa' }, staff).error, /Awa/);
  assert.ok(checkCallBack({ note: 'x'.repeat(301) }, low, staff).error);
});
