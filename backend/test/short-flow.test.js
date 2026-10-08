import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShortcut, transitionError } from '../src/services/order-status.js';
import { currentMessageKey, messageModel, noticeError, noticeState, renderMessage, stepStart } from '../src/services/customer-messages.js';

const ctx = { siteUrl: 'https://site', payment: { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*MONTANT#', MOOV_MONEY: '*2*MONTANT#', TELECEL_MONEY: '*3*MONTANT#' } } };
const at = (min) => new Date(Date.UTC(2026, 9, 8, 12, min));
// Commande passée par le parcours court : deux lignes d'historique au même moment, comme l'écrit changeStatus
const short = (extra = {}) => ({
  customerName: 'Awa', reference: 'BC-ABC123', itemsTotal: 8000, deliveryFee: 750, mode: 'LIVRAISON',
  status: 'EN_PREPARATION', shortFlow: true,
  statusChanges: [
    { toStatus: 'PAIEMENT_A_VERIFIER', createdAt: at(0) },
    { toStatus: 'PAYEE', createdAt: at(5) },
    { toStatus: 'EN_PREPARATION', createdAt: at(5) },
  ],
  events: [],
  ...extra,
});

test('parcours court : seulement de « à vérifier » à « en préparation »', () => {
  assert.equal(isShortcut('PAIEMENT_A_VERIFIER', 'EN_PREPARATION'), true);
  assert.equal(isShortcut('PAYEE', 'EN_PREPARATION'), false);
  assert.equal(isShortcut('PAIEMENT_A_VERIFIER', 'PAYEE'), false);
  // Le parcours normal reste celui d'avant : le saut direct est refusé par les règles de statut
  assert.match(transitionError('PAIEMENT_A_VERIFIER', 'EN_PREPARATION', null), /Passage impossible/);
});

test('parcours court : un seul message, paiement et préparation', () => {
  const o = short();
  assert.equal(currentMessageKey(o).key, 'PAIEMENT_PREPARATION');
  const text = renderMessage('PAIEMENT_PREPARATION', o, ctx);
  assert.match(text, /reçu votre paiement de 8 000 F pour la commande BC-ABC123\. Merci ! Votre commande est en préparation\./);
  assert.match(text, /Frais de livraison : 750 F, à payer au livreur/);
  assert.match(text, /\*1\*750#/);
  assert.doesNotMatch(text, /\{\{\d+\}\}/);
  // Livraison offerte
  const free = short({ deliveryFee: 0 });
  assert.equal(messageModel('PAIEMENT_PREPARATION', free).template, 'commande_paiement_preparation_offerte');
  assert.match(renderMessage('PAIEMENT_PREPARATION', free, ctx), /Livraison offerte : vous n’avez rien à payer au livreur\./);
  // À emporter
  const pickup = short({ mode: 'A_EMPORTER', deliveryFee: null });
  assert.equal(currentMessageKey(pickup).key, 'PAIEMENT_PREPARATION_EMPORTER');
  const p = renderMessage('PAIEMENT_PREPARATION_EMPORTER', pickup, ctx);
  assert.match(p, /commande à emporter BC-ABC123\. Merci ! Votre commande est en préparation : nous vous écrivons dès qu’elle est prête/);
  assert.doesNotMatch(p, /Frais de livraison/);
});

test('parcours court : l’envoi doit être confirmé avant le départ du livreur', () => {
  const o = short();
  assert.equal(noticeState(o).required, true);
  assert.match(noticeError(noticeState(o)), /Paiement confirmé, commande en préparation/);
  const sent = short({ events: [{ type: 'MESSAGE_ENVOYE', messageKey: 'PAIEMENT_PREPARATION', createdAt: at(6) }] });
  assert.equal(noticeState(sent).required, false);
  // Frais corrigés ensuite : nouveau message à confirmer
  const corrected = short({ events: [...sent.events, { type: 'FRAIS_CORRIGES', createdAt: at(8) }] });
  assert.equal(stepStart(corrected, 'PAIEMENT_PREPARATION'), at(8).getTime());
  assert.equal(noticeState(corrected).required, true);
  assert.equal(noticeState(sent, { auto: true }).required, false);
});

test('parcours normal inchangé : commandes sans parcours court', () => {
  const normal = short({ shortFlow: false });
  assert.equal(currentMessageKey(normal).key, 'EN_PREPARATION');
  assert.equal(currentMessageKey({ ...normal, status: 'PAYEE' }).key, 'PAIEMENT_CONFIRME');
  assert.equal(currentMessageKey({ ...normal, mode: 'A_EMPORTER' }).key, 'EN_PREPARATION_EMPORTER');
  // Le message « commande en préparation » confirmé avant le réglage reste valable
  const sent = { ...normal, events: [{ type: 'MESSAGE_ENVOYE', messageKey: 'EN_PREPARATION', createdAt: at(6) }] };
  assert.equal(noticeState(sent).required, false);
});
