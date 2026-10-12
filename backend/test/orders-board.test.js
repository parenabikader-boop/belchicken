// Lot 12 (page Commandes plus lisible) : début de l'étape et message au client à confirmer, ajoutés à la liste des
// commandes en cours (staff-orders.service.js), sans rien retirer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsThanks, noticePending, stageSince } from '../src/services/customer-messages.js';

const at = (min) => new Date(Date.UTC(2026, 9, 9, 19, min));
const change = (toStatus, min) => ({ toStatus, createdAt: at(min) });
const sent = (messageKey, min, type = 'MESSAGE_ENVOYE') => ({ type, messageKey, createdAt: at(min) });
const base = { mode: 'LIVRAISON', deliveryOperator: 'RESTAURANT', deliveryFee: 1000, createdAt: at(0), createdById: null, shortFlow: true };

test('début de l’étape : dernier passage au statut actuel, sinon l’heure de la commande', () => {
  const o = { ...base, status: 'EN_PREPARATION', statusChanges: [change('PAIEMENT_A_VERIFIER', 0), change('PAYEE', 6), change('EN_PREPARATION', 6)] };
  assert.deepEqual(stageSince(o), at(6));
  assert.deepEqual(stageSince({ ...o, status: 'PAIEMENT_A_VERIFIER', statusChanges: [change('PAIEMENT_A_VERIFIER', 0)] }), at(0));
  assert.deepEqual(stageSince({ ...o, statusChanges: [] }), at(0));
});

test('message à confirmer : seulement quand l’étape suivante attend le message au client', () => {
  const prep = { ...base, status: 'EN_PREPARATION', statusChanges: [change('PAIEMENT_A_VERIFIER', 0), change('PAYEE', 6), change('EN_PREPARATION', 6)], events: [] };
  assert.equal(noticePending(prep), true, 'paiement vérifié, message pas encore confirmé');
  assert.equal(noticePending({ ...prep, events: [sent('PAIEMENT_PREPARATION', 8)] }), false);
  assert.equal(noticePending({ ...prep, events: [sent('PAIEMENT_PREPARATION', 8, 'CLIENT_APPELE')] }), false, 'client prévenu par appel');
  assert.equal(noticePending(prep, { auto: true }), false, 'envoi automatique : rien à confirmer');
  // Paiement à vérifier : rien à dire au client (site), message facultatif (commande saisie par un agent)
  const toVerify = { ...base, status: 'PAIEMENT_A_VERIFIER', statusChanges: [change('PAIEMENT_A_VERIFIER', 0)], events: [] };
  assert.equal(noticePending(toVerify), false);
  assert.equal(noticePending({ ...toVerify, createdById: 'agent' }), false);
  // Prête pour livraison (mode Prestataire) : pas de message à cette étape
  assert.equal(noticePending({ ...prep, deliveryOperator: 'PRESTATAIRE', status: 'PRETE_LIVRAISON', events: [sent('PAIEMENT_PREPARATION', 8)] }), false);
  // En route : le message « en route » est attendu
  const route = { ...prep, status: 'EN_LIVRAISON', statusChanges: [...prep.statusChanges, change('EN_LIVRAISON', 30)], events: [sent('PAIEMENT_PREPARATION', 8)] };
  assert.equal(noticePending(route), true);
  assert.equal(noticePending({ ...route, events: [...route.events, sent('EN_ROUTE', 31)] }), false);
});

test('livrée à remercier : même règle que l’étape « Livrées · à remercier »', () => {
  const done = {
    ...base, status: 'LIVREE',
    statusChanges: [change('PAIEMENT_A_VERIFIER', 0), change('PAYEE', 6), change('EN_PREPARATION', 6), change('EN_LIVRAISON', 30), change('LIVREE', 50)],
    events: [sent('PAIEMENT_PREPARATION', 8), sent('EN_ROUTE', 31)],
  };
  assert.equal(noticePending(done), needsThanks(done));
  assert.equal(noticePending(done), true);
  const thanked = { ...done, events: [...done.events, sent('LIVREE', 55)] };
  assert.equal(noticePending(thanked), false);
  assert.equal(needsThanks(thanked), false);
  assert.deepEqual(stageSince(done), at(50));
});
