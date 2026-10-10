// Lot 5c : « Prête pour livraison », « Commande récupérée », tournées, preuves horaires (règles sans base)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryProofs, partnerAssignError, partnerRunError, partnerUnassignError, pickupError, restaurantTourError, RUN_MAX,
} from '../src/services/dispatch.js';
import { isPartnerDelivery, nextStatus, transitionError } from '../src/services/order-status.js';
import { feeEditRight } from '../src/services/delivery-fees.js';
import { courierAssignError } from '../src/services/courier.js';
import { currentMessageKey } from '../src/services/customer-messages.js';
import { partnerNotification } from '../src/services/push.message.js';

const partner = (extra = {}) => ({ reference: 'BC-P1', mode: 'LIVRAISON', deliveryOperator: 'PRESTATAIRE', status: 'EN_PREPARATION', deliveryFee: 1000, courierId: null, ...extra });
const resto = (extra = {}) => ({ reference: 'BC-R1', mode: 'LIVRAISON', deliveryOperator: 'RESTAURANT', status: 'EN_PREPARATION', deliveryFee: 1000, ...extra });

test('parcours Prestataire : préparation → prête pour livraison → en livraison → livrée', () => {
  assert.equal(nextStatus('EN_PREPARATION', 'LIVRAISON', 'PRESTATAIRE'), 'PRETE_LIVRAISON');
  assert.equal(nextStatus('PRETE_LIVRAISON', 'LIVRAISON', 'PRESTATAIRE'), 'EN_LIVRAISON');
  assert.equal(transitionError('EN_PREPARATION', 'PRETE_LIVRAISON', null, 'LIVRAISON', 'PRESTATAIRE'), null);
  assert.match(transitionError('EN_PREPARATION', 'EN_LIVRAISON', null, 'LIVRAISON', 'PRESTATAIRE'), /Passage impossible/);
  assert.equal(transitionError('PRETE_LIVRAISON', 'ANNULEE', 'Client injoignable', 'LIVRAISON', 'PRESTATAIRE'), null);
});

test('rien ne change pour le restaurant et l’emporter : pas d’étape « Prête pour livraison »', () => {
  assert.equal(nextStatus('EN_PREPARATION'), 'EN_LIVRAISON');
  assert.equal(nextStatus('EN_PREPARATION', 'LIVRAISON', 'RESTAURANT'), 'EN_LIVRAISON');
  assert.equal(nextStatus('EN_PREPARATION', 'A_EMPORTER', 'PRESTATAIRE'), 'PRETE'); // à emporter : toujours le restaurant
  assert.match(transitionError('EN_PREPARATION', 'PRETE_LIVRAISON', null, 'LIVRAISON', 'RESTAURANT'), /Passage impossible/);
  assert.equal(isPartnerDelivery(resto()), false);
  assert.equal(isPartnerDelivery(partner({ mode: 'A_EMPORTER' })), false);
});

test('« Prête pour livraison » : aucun message au client, frais encore corrigeables par l’équipe', () => {
  assert.equal(currentMessageKey(partner({ status: 'PRETE_LIVRAISON' })), null);
  assert.equal(feeEditRight(partner({ status: 'PRETE_LIVRAISON' })).who, 'TOUS');
});

test('le Responsable confie une commande dès la préparation, jusqu’à la récupération', () => {
  assert.equal(partnerAssignError(partner(), 'l1'), null);
  assert.equal(partnerAssignError(partner({ status: 'PRETE_LIVRAISON', courierId: 'l2' }), 'l1'), null); // change de livreur
  assert.match(partnerAssignError(partner({ courierId: 'l1' }), 'l1'), /déjà confiée à ce livreur/);
  assert.match(partnerAssignError(partner({ status: 'EN_LIVRAISON' }), 'l1'), /déjà récupérée/);
  assert.match(partnerAssignError(partner({ status: 'PAYEE' }), 'l1'), /n’attend pas de livreur/);
  assert.match(partnerAssignError(resto(), 'l1'), /livrée par le restaurant/);
  assert.equal(courierAssignError(partner({ status: 'PRETE_LIVRAISON' }), { id: 'l1', name: 'Issa', role: 'LIVREUR', isActive: true, courierTeam: 'PRESTATAIRE' }), null);
});

test('tournée Prestataire : une à dix commandes, toutes valables, sinon aucune', () => {
  const orders = [partner(), partner({ reference: 'BC-P2', status: 'PRETE_LIVRAISON' })];
  assert.equal(partnerRunError({ orders, references: ['BC-P1', 'BC-P2'], courierId: 'l1' }), null);
  assert.match(partnerRunError({ orders, references: ['BC-P1', 'BC-P2'], courierId: '' }), /Choisissez le livreur/);
  assert.match(partnerRunError({ orders: [], references: [], courierId: 'l1' }), /au moins une/);
  assert.match(partnerRunError({ orders: [orders[0]], references: ['BC-P1', 'BC-P9'], courierId: 'l1' }), /introuvable/);
  assert.match(partnerRunError({ orders: [orders[0], resto()], references: ['BC-P1', 'BC-R1'], courierId: 'l1' }), /BC-R1 est livrée par le restaurant/);
  const many = Array.from({ length: RUN_MAX + 1 }, (_, i) => `BC-${i}`);
  assert.match(partnerRunError({ orders: [], references: many, courierId: 'l1' }), /au plus 10/);
});

test('retirer le livreur : seulement avant la récupération', () => {
  assert.equal(partnerUnassignError(partner({ courierId: 'l1' })), null);
  assert.match(partnerUnassignError(partner()), /Aucun livreur/);
  assert.match(partnerUnassignError(partner({ status: 'EN_LIVRAISON', courierId: 'l1' })), /avant la récupération/);
});

test('« Commande récupérée » : par son livreur, ou à sa place avec un motif', () => {
  const ready = partner({ status: 'PRETE_LIVRAISON', courierId: 'l1' });
  assert.equal(pickupError(ready, { byCourier: true, actorId: 'l1' }), null);
  assert.match(pickupError(ready, { byCourier: true, actorId: 'l2' }), /ne vous est pas confiée/);
  assert.match(pickupError(ready, { byCourier: false, actorId: 'a1', reason: '' }), /Indiquez pourquoi/);
  assert.equal(pickupError(ready, { byCourier: false, actorId: 'a1', reason: 'Téléphone du livreur éteint' }), null);
  assert.match(pickupError(partner({ courierId: 'l1' }), { byCourier: true, actorId: 'l1' }), /pas encore prête/);
  assert.match(pickupError(partner({ status: 'PRETE_LIVRAISON' }), { byCourier: false, reason: 'motif' }), /Aucun livreur/);
  assert.match(pickupError(partner({ status: 'EN_LIVRAISON', courierId: 'l1' }), { byCourier: true, actorId: 'l1' }), /déjà récupérée/);
  assert.match(pickupError(resto({ status: 'PRETE_LIVRAISON' }), { byCourier: true, actorId: 'l1' }), /restaurant/);
});

test('tournée du restaurant : seulement avec le réglage, des commandes du restaurant en préparation', () => {
  const ok = { dispatch: true, orders: [resto(), resto({ reference: 'BC-R2' })], seen: { 'BC-R1': 'EN_PREPARATION' }, references: ['BC-R1', 'BC-R2'] };
  assert.equal(restaurantTourError(ok), null);
  assert.match(restaurantTourError({ ...ok, dispatch: false }), /pas activées/);
  assert.match(restaurantTourError({ ...ok, orders: [resto(), partner({ reference: 'BC-R2' })] }), /BC-R2 est livrée par notre partenaire/);
  assert.match(restaurantTourError({ ...ok, orders: [resto({ status: 'PAYEE' }), resto({ reference: 'BC-R2' })] }), /déjà changé/);
  assert.match(restaurantTourError({ ...ok, seen: {}, orders: [resto({ status: 'PAYEE' }), resto({ reference: 'BC-R2' })] }), /n’est pas en préparation/);
  assert.match(restaurantTourError({ ...ok, orders: [resto({ mode: 'A_EMPORTER' }), resto({ reference: 'BC-R2' })] }), /à emporter/);
  assert.match(restaurantTourError({ ...ok, references: ['BC-R1', 'BC-R1'] }), /deux fois/);
});

test('preuves : l’heure de chaque étape et les durées (attente du livreur, trajet)', () => {
  const t = (hm) => new Date(`2026-10-10T${hm}:00Z`);
  const proofs = deliveryProofs({
    statusChanges: [
      { toStatus: 'EN_PREPARATION', createdAt: t('12:00') },
      { toStatus: 'PRETE_LIVRAISON', createdAt: t('12:20') },
      { toStatus: 'EN_LIVRAISON', createdAt: t('12:35'), staffName: 'Awa', reason: 'Téléphone du livreur éteint' },
      { toStatus: 'LIVREE', createdAt: t('12:58') },
    ],
    events: [{ type: 'LIVREUR_ASSIGNE', createdAt: t('12:05') }],
  });
  assert.deepEqual(proofs, {
    preparedAt: t('12:00'), readyAt: t('12:20'), assignedAt: t('12:05'), pickedUpAt: t('12:35'), pickedUpBy: 'Awa',
    pickedUpReason: 'Téléphone du livreur éteint', deliveredAt: t('12:58'), waitMinutes: 15, rideMinutes: 23,
  });
  // Commande du restaurant (pas d'étape « prête ») : pas de temps d'attente, le trajet compte
  const resto = deliveryProofs({ statusChanges: [{ toStatus: 'EN_LIVRAISON', createdAt: t('13:00') }, { toStatus: 'LIVREE', createdAt: t('13:30') }], events: [] });
  assert.equal(resto.waitMinutes, null);
  assert.equal(resto.rideMinutes, 30);
});

test('alertes du Responsable livraison : référence, quartier, livreur ; jamais de montant des plats', () => {
  const order = { reference: 'BC-P1', deliveryZoneName: 'Gounghin', courierName: null, itemsTotal: 9000 };
  const ready = partnerNotification(order, 'PRETE');
  assert.match(ready.title, /BC-P1 prête pour livraison/);
  assert.match(ready.body, /Aucun livreur/);
  assert.match(partnerNotification({ ...order, courierName: 'Issa' }, 'PRETE').body, /Issa peut la récupérer/);
  assert.match(partnerNotification(order, 'A_ATTRIBUER').title, /à attribuer/);
  for (const n of [ready, partnerNotification(order, 'A_ATTRIBUER')]) {
    assert.equal(n.url, '/equipe/livraison');
    assert.doesNotMatch(JSON.stringify(n), /9000|9 000/);
  }
});

test('suivi du client : « Prête pour livraison » reste « En préparation » pour lui', async () => {
  const { toPublicOrder } = await import('../src/services/order.service.js');
  const at = (m) => new Date(Date.UTC(2026, 9, 10, 12, m));
  const base = {
    reference: 'BC-P1', mode: 'LIVRAISON', deliveryOperator: 'PRESTATAIRE', createdAt: at(0), paymentMethod: 'ORANGE_MONEY',
    itemsTotal: 5000, deliveryFee: 1000, items: [],
    statusChanges: [{ toStatus: 'PAIEMENT_A_VERIFIER', createdAt: at(0) }, { toStatus: 'EN_PREPARATION', createdAt: at(5) }, { toStatus: 'PRETE_LIVRAISON', createdAt: at(20) }],
  };
  const ctx = { payment: { merchantName: 'ECOFOOD', codes: {} } };
  const ready = toPublicOrder({ ...base, status: 'PRETE_LIVRAISON' }, ctx);
  assert.equal(ready.status, 'EN_PREPARATION');
  assert.deepEqual(ready.steps.map((s) => s.status), ['PAIEMENT_A_VERIFIER', 'EN_PREPARATION']);
  const gone = toPublicOrder({ ...base, status: 'EN_LIVRAISON', statusChanges: [...base.statusChanges, { toStatus: 'EN_LIVRAISON', createdAt: at(30) }] }, ctx);
  assert.equal(gone.status, 'EN_LIVRAISON');
  assert.deepEqual(gone.steps.map((s) => s.status), ['PAIEMENT_A_VERIFIER', 'EN_PREPARATION', 'EN_LIVRAISON']);
});
