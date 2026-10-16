// Plan 1, call center allégé (interrupteur CALL_CENTER_ALLEGE, fermé sans ligne). Sans base de données.
// Fermé : tout est exactement comme avant (comparé à l'appel sans l'option). Ouvert : aucune étape n'attend plus un
// message (sauf le remerciement), le livreur peut valider sans code avec un motif, signalé et compté à part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_CENTER_LIGHT, featureMap } from '../src/services/features.js';
import { needsThanks, noticeError, noticePending, noticeState } from '../src/services/customer-messages.js';
import { courierNoCodeError } from '../src/services/courier.js';
import { noCodeDeliveries } from '../src/services/courier-team.js';
import { buildStatement, parsePeriod } from '../src/services/statement.js';
import { noCodeNotification } from '../src/services/push.message.js';
import { staffRouter } from '../src/routes/staff.routes.js';
import { accessFor } from '../src/middlewares/staff-auth.js';

const at = (min) => new Date(Date.UTC(2026, 9, 16, 12, min));
const order = (status, extra = {}) => ({
  reference: 'BC-ABC123', customerName: 'Awa', mode: 'LIVRAISON', status, deliveryFee: 1000, shortFlow: true,
  statusChanges: [
    { toStatus: 'PAIEMENT_A_VERIFIER', createdAt: at(0) },
    { toStatus: 'PAYEE', createdAt: at(5) },
    { toStatus: 'EN_PREPARATION', createdAt: at(5) },
    ...(['EN_LIVRAISON', 'LIVREE'].includes(status) ? [{ toStatus: 'EN_LIVRAISON', createdAt: at(30) }] : []),
    ...(status === 'LIVREE' ? [{ toStatus: 'LIVREE', createdAt: at(50) }] : []),
  ],
  events: [],
  ...extra,
});

// Toutes les situations d'un message : chaque étape, à récupérer, frais manquants, déjà confirmé, commande d'agent
const SAMPLES = [
  order('PAIEMENT_A_VERIFIER'),
  order('PAIEMENT_A_VERIFIER', { createdById: 'agent' }),
  order('PAYEE', { shortFlow: false }),
  order('EN_PREPARATION'),
  order('EN_PREPARATION', { shortFlow: false }),
  order('EN_PREPARATION', { deliveryFee: null }),
  order('EN_PREPARATION', { events: [{ type: 'MESSAGE_ENVOYE', messageKey: 'PAIEMENT_PREPARATION', createdAt: at(6) }] }),
  order('PRETE_LIVRAISON'),
  order('EN_LIVRAISON'),
  order('LIVREE'),
  order('ANNULEE'),
  order('PRETE', { mode: 'A_EMPORTER' }),
  order('LIVREE', { mode: 'A_EMPORTER' }),
];

test('interrupteur CALL_CENTER_ALLEGE : fermé sans ligne, ouvert seulement par le Prestataire', () => {
  assert.equal(CALL_CENTER_LIGHT, 'CALL_CENTER_ALLEGE');
  assert.equal(featureMap([])[CALL_CENTER_LIGHT], false);
  assert.equal(featureMap([{ key: CALL_CENTER_LIGHT, enabled: false }])[CALL_CENTER_LIGHT], false);
  assert.equal(featureMap([{ key: CALL_CENTER_LIGHT, enabled: true }])[CALL_CENTER_LIGHT], true);
});

test('fermé : les messages bloquent exactement comme avant (même réponse qu’avant le plan 1)', () => {
  for (const o of SAMPLES) {
    for (const auto of [false, true]) {
      assert.deepEqual(noticeState(o, { auto, light: false }), noticeState(o, { auto }), `${o.status} ${o.mode}`);
      assert.equal(noticePending(o, { auto, light: false }), noticePending(o, { auto }));
    }
    assert.equal(noticeState(o, { light: false })?.skippable, undefined);
  }
  // Rappel de la règle d'avant : le message « en route » bloque la suite, le remerciement aussi
  assert.equal(noticeState(order('EN_LIVRAISON')).required, true);
  assert.match(noticeError(noticeState(order('EN_PREPARATION'))), /Prévenez d’abord le client/);
});

test('ouvert : aucune étape n’attend plus un message, le message reste proposé (skippable)', () => {
  for (const status of ['PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'ANNULEE']) {
    const state = noticeState(order(status, { shortFlow: status !== 'PAYEE' }), { light: true });
    assert.equal(state.required, false, status);
    assert.equal(state.skippable, true, status);
    assert.equal(noticeError(state), null, status);
  }
  assert.equal(noticePending(order('EN_LIVRAISON'), { light: true }), false);
  // À récupérer : « commande prête » ne bloque plus non plus
  assert.equal(noticeState(order('PRETE', { mode: 'A_EMPORTER' }), { light: true }).required, false);
  // Message déjà confirmé, envoi automatique, message facultatif : rien de nouveau
  const sent = order('EN_PREPARATION', { events: [{ type: 'MESSAGE_ENVOYE', messageKey: 'PAIEMENT_PREPARATION', createdAt: at(6) }] });
  assert.deepEqual(noticeState(sent, { light: true }), noticeState(sent));
  assert.deepEqual(noticeState(order('EN_LIVRAISON'), { auto: true, light: true }), noticeState(order('EN_LIVRAISON'), { auto: true }));
  const agent = order('PAIEMENT_A_VERIFIER', { createdById: 'agent' });
  assert.deepEqual(noticeState(agent, { light: true }), noticeState(agent));
});

test('ouvert : le remerciement reste demandé, et des frais manquants bloquent toujours', () => {
  for (const o of [order('LIVREE'), order('LIVREE', { mode: 'A_EMPORTER' })]) {
    assert.deepEqual(noticeState(o, { light: true }), noticeState(o));
    assert.equal(noticeState(o, { light: true }).required, true);
  }
  assert.equal(needsThanks(order('LIVREE')), true);
  const noFee = order('EN_PREPARATION', { deliveryFee: null });
  assert.equal(noticeState(noFee, { light: true }).required, true);
  assert.match(noticeError(noticeState(noFee, { light: true })), /frais de livraison/);
});

test('livreur sans le code du client : sa course en livraison, motif obligatoire', () => {
  const course = { courierId: 'c1', status: 'EN_LIVRAISON', mode: 'LIVRAISON' };
  assert.equal(courierNoCodeError(course, 'c1', 'Client a effacé le message'), null);
  assert.match(courierNoCodeError(course, 'c1', ''), /pourquoi la livraison est validée sans code/);
  assert.match(courierNoCodeError(course, 'c1', '  ab '), /pourquoi/);
  assert.match(courierNoCodeError(course, 'c1', undefined), /pourquoi/);
  assert.match(courierNoCodeError(course, 'c2', 'motif ok'), /pas assignée/);
  assert.match(courierNoCodeError(null, 'c1', 'motif ok'), /pas assignée/);
  assert.match(courierNoCodeError({ ...course, status: 'LIVREE' }, 'c1', 'motif ok'), /déjà livrée/);
  assert.match(courierNoCodeError({ ...course, status: 'ANNULEE' }, 'c1', 'motif ok'), /annulée/);
  assert.match(courierNoCodeError({ ...course, status: 'PRETE_LIVRAISON' }, 'c1', 'motif ok'), /pas en livraison/);
  assert.match(courierNoCodeError({ ...course, mode: 'A_EMPORTER' }, 'c1', 'motif ok'), /comptoir/);
  // Même après 5 codes faux ou sans code : c'est justement le cas prévu
  assert.equal(courierNoCodeError({ ...course, deliveryCodeAttempts: 5, deliveryCode: null }, 'c1', 'Client sans code'), null);
});

test('Responsable livraison : livrées sans code en rouge, avec le motif, le livreur et qui a validé', () => {
  const change = (toStatus, min, extra = {}) => ({ toStatus, createdAt: at(min), staffUserId: 'agent', staffName: 'Awa', reason: null, ...extra });
  const list = noCodeDeliveries([
    { reference: 'BC-1', status: 'LIVREE', courierId: 'c1', courierName: 'Rasmané', deliveryZoneName: 'Gounghin', statusChanges: [change('EN_LIVRAISON', 30), change('LIVREE', 50, { staffUserId: 'c1', staffName: 'Rasmané', reason: 'Client sans code' })] },
    { reference: 'BC-2', status: 'LIVREE', courierId: 'c1', courierName: 'Rasmané', statusChanges: [change('LIVREE', 40, { staffUserId: 'c1', staffName: 'Rasmané' })] }, // avec le code
    { reference: 'BC-3', status: 'LIVREE', courierId: 'c2', courierName: 'Adama', statusChanges: [change('LIVREE', 45, { reason: 'Code effacé, vérifié par appel' })] }, // par l'agent
  ]);
  assert.deepEqual(list.map((x) => [x.reference, x.courierName, x.reason, x.by, x.byCourier]), [
    ['BC-1', 'Rasmané', 'Client sans code', 'Rasmané', true],
    ['BC-3', 'Adama', 'Code effacé, vérifié par appel', 'Awa', false],
  ]);
  assert.equal(list[0].deliveryZoneName, 'Gounghin');
});

test('alerte au Responsable livraison : motif et livreur, jamais le nom ni le téléphone du client', () => {
  const n = noCodeNotification({ reference: 'BC-1', courierName: 'Rasmané', customerName: 'Awa Client', customerPhone: '+22670000000' }, 'Client a perdu le message');
  assert.match(n.title, /SANS CODE/);
  assert.match(n.body, /Rasmané/);
  assert.match(n.body, /Client a perdu le message/);
  assert.doesNotMatch(`${n.title} ${n.body}`, /Awa Client|70000000/);
  assert.equal(n.url, '/equipe/livraison');
  assert.ok(noCodeNotification({ reference: 'BC-1' }, 'x'.repeat(400)).body.length < 220);
});

// ─── Relevé ───

const NOW = new Date('2026-10-20T15:00:00Z');
const stmtChange = (toStatus, time, extra = {}) => ({ toStatus, createdAt: new Date(time), fromStatus: null, reason: null, staffName: 'Agent', ...extra });
const delivered = (reference, courierId, courierName, livree) => ({
  reference, status: 'LIVREE', deliveryFee: 1000, deliveryNightFee: null, deliveryFeeMethod: 'ESPECES', deliveryFeeVerifiedAt: null,
  cashRemittanceId: null, courierId, courierName, deliveryRunId: null, deliveryZoneName: 'Gounghin', events: [],
  statusChanges: [stmtChange('PAYEE', '2026-10-10T12:00:00Z'), stmtChange('EN_LIVRAISON', '2026-10-10T12:30:00Z'), livree],
});
const ORDERS = [
  delivered('BC-A', 'c1', 'Rasmané', stmtChange('LIVREE', '2026-10-10T12:50:00Z', { staffName: 'Rasmané' })),
  delivered('BC-B', 'c1', 'Rasmané', stmtChange('LIVREE', '2026-10-10T13:00:00Z', { staffName: 'Rasmané', reason: 'Client sans code' })),
  delivered('BC-C', 'c2', 'Adama', stmtChange('LIVREE', '2026-10-11T13:00:00Z', { staffName: 'Awa', reason: 'Code effacé' })),
];
const build = (extra = {}) => buildStatement({
  period: parsePeriod('2026-10-01', '2026-10-20', NOW), orders: ORDERS, runs: [], versions: [], company: null, withContract: false, now: NOW, ...extra,
});

test('relevé fermé : exactement celui d’avant, sans aucune ligne « sans code »', () => {
  assert.deepEqual(build({ light: false }), build());
  const s = build();
  assert.equal('withoutCode' in s.summary, false);
  assert.ok(s.deliveries.every((d) => !('withoutCode' in d) && !('withoutCodeReason' in d)));
  assert.ok(s.couriers.every((c) => !('withoutCode' in c)));
});

test('relevé ouvert : livraisons sans code comptées à part, par livreur, avec le motif et qui a validé', () => {
  const s = build({ light: true });
  assert.equal(s.summary.withoutCode, 2);
  assert.equal(s.summary.deliveries, 3); // toujours comptées comme livraisons
  assert.deepEqual(s.deliveries.map((d) => [d.reference, d.withoutCode, d.withoutCodeReason, d.withoutCodeBy]), [
    ['BC-A', false, null, null],
    ['BC-B', true, 'Client sans code', 'Rasmané'],
    ['BC-C', true, 'Code effacé', 'Awa'],
  ]);
  assert.deepEqual(s.couriers.map((c) => [c.name, c.deliveries, c.withoutCode]), [['Rasmané', 2, 1], ['Adama', 1, 1]]);
  // Le reste du relevé ne change pas
  const before = build();
  assert.deepEqual(s.fees, before.fees);
  assert.deepEqual(s.delays, before.delays);
});

// ─── Accès ───

test('« valider sans code » : adresse réservée au livreur (ni l’agent, ni le Responsable livraison)', () => {
  const find = (router, path) => {
    for (const layer of router.stack) {
      if (layer.handle?.stack) {
        const route = layer.handle.stack.find((l) => l.route?.path === path && l.route.methods.post);
        if (route) return { router: layer.handle, route };
      }
    }
    return null;
  };
  const found = find(staffRouter, '/:reference/sans-code');
  assert.ok(found, 'adresse POST /courses/:reference/sans-code introuvable');
  const guards = found.router.stack.map((l) => l.handle.staffAccess).filter(Boolean);
  const allowed = (role) => guards.every((g) => accessFor({ id: 'u', role, mustChangePassword: false }, g.roles, g) === 'ok');
  assert.equal(allowed('LIVREUR'), true);
  for (const role of ['OPERATEUR', 'RESPONSABLE_LIVRAISON', 'PATRON']) assert.equal(allowed(role), false, role);
});
