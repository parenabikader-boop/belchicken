// Lot 12 : temps d'attente, couleurs, ordre, colonnes et bandeau de la nouvelle page Commandes (waiting.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardColumns, byUrgency, byWait, nothingLine, summary, THRESHOLDS, waitKey, waitLevel, waitMinutes, waitText } from './waiting.js';

const NOW = Date.UTC(2026, 9, 9, 20, 0);
const ago = (min) => new Date(NOW - min * 60000).toISOString();

test('seuils validés par le client', () => {
  assert.deepEqual(THRESHOLDS, {
    PAIEMENT_A_VERIFIER: [5, 10], PAYEE: [5, 10], EN_PREPARATION: [25, 40], PRETE_LIVRAISON: [10, 20],
    EN_LIVRAISON: [40, 60], PRETE: [30, 60], A_REMERCIER: [30, 120],
  });
});

test('attente comptée depuis le début de l’étape, pas depuis la commande', () => {
  const o = { status: 'EN_PREPARATION', createdAt: ago(50), stageSince: ago(12) };
  assert.equal(waitMinutes(o, NOW), 12);
  assert.equal(waitLevel(o, NOW), 'ok');
  assert.equal(waitMinutes({ status: 'PAIEMENT_A_VERIFIER', createdAt: ago(7) }, NOW), 7, 'sans début d’étape : heure de la commande');
});

test('couleurs : normal, orange au premier seuil, rouge au second', () => {
  const at = (status, min, extra = {}) => waitLevel({ status, stageSince: ago(min), createdAt: ago(min), ...extra }, NOW);
  assert.deepEqual([at('PAIEMENT_A_VERIFIER', 4), at('PAIEMENT_A_VERIFIER', 5), at('PAIEMENT_A_VERIFIER', 10)], ['ok', 'warn', 'late']);
  assert.deepEqual([at('EN_PREPARATION', 24), at('EN_PREPARATION', 25), at('EN_PREPARATION', 40)], ['ok', 'warn', 'late']);
  assert.deepEqual([at('PRETE_LIVRAISON', 9), at('PRETE_LIVRAISON', 20)], ['ok', 'late']);
  assert.deepEqual([at('EN_LIVRAISON', 39), at('EN_LIVRAISON', 59), at('EN_LIVRAISON', 60)], ['ok', 'warn', 'late']);
  assert.deepEqual([at('PRETE', 30), at('PRETE', 61)], ['warn', 'late']);
  assert.equal(waitKey({ status: 'LIVREE', toThank: true }), 'A_REMERCIER');
  assert.deepEqual([at('LIVREE', 29, { toThank: true }), at('LIVREE', 119, { toThank: true }), at('LIVREE', 120, { toThank: true })], ['ok', 'warn', 'late']);
  assert.equal(at('LIVREE', 500), null, 'terminée : pas de couleur');
  assert.equal(at('ANNULEE', 500), null);
});

test('texte du temps d’attente', () => {
  assert.deepEqual([waitText(0), waitText(7), waitText(65), waitText(125), waitText(3000)], ['à l’instant', '7 min', '1 h 05', '2 h 05', '2 j']);
});

test('plus longue attente à l’étape en haut', () => {
  const list = [
    { reference: 'A', createdAt: ago(60), stageSince: ago(5) },
    { reference: 'B', createdAt: ago(20), stageSince: ago(18) },
    { reference: 'C', createdAt: ago(30), stageSince: null },
  ].sort(byWait);
  assert.deepEqual(list.map((o) => o.reference), ['C', 'B', 'A']);
});

test('étapes : seules celles qui ont des commandes ; « Payées » cachée avec le parcours court quand elle est vide', () => {
  const stages = ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'PRETE'].map((id) => ({ id }));
  const counts = { PAIEMENT_A_VERIFIER: 3, PAYEE: 0, EN_PREPARATION: 5, PRETE: 0 };
  const cols = (shortFlow, c = counts) => {
    const { visible, empty } = boardColumns(stages, (id) => c[id], { shortFlow });
    return { visible: visible.map((x) => x.stage.id), empty: empty.map((x) => x.stage.id) };
  };
  assert.deepEqual(cols(true), { visible: ['PAIEMENT_A_VERIFIER', 'EN_PREPARATION'], empty: ['PRETE'] });
  assert.deepEqual(cols(false), { visible: ['PAIEMENT_A_VERIFIER', 'EN_PREPARATION'], empty: ['PAYEE', 'PRETE'] });
  assert.deepEqual(cols(true, { ...counts, PAYEE: 1 }).visible, ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION'], 'commande déjà payée : on la voit');
  assert.deepEqual(cols(true, {}), { visible: [], empty: ['PAIEMENT_A_VERIFIER', 'EN_PREPARATION', 'PRETE'] });
});

test('ligne des étapes vides', () => {
  const e = (...ids) => ids.map((id) => ({ stage: { id } }));
  assert.equal(nothingLine(e('PAIEMENT_A_VERIFIER', 'EN_PREPARATION', 'EN_LIVRAISON', 'PRETE')), 'Rien à vérifier, rien en préparation, rien en livraison, rien à retirer.');
  assert.equal(nothingLine(e('A_REMERCIER')), 'Personne à remercier.');
  assert.equal(nothingLine(e('PAYEE')), 'Rien à lancer.');
  assert.equal(nothingLine([]), null);
});

test('onglet « Tout » : rouges, puis orange, puis les autres ; à couleur égale, la plus proche de son seuil rouge', () => {
  const list = [
    { reference: 'prep20', status: 'EN_PREPARATION', stageSince: ago(20) }, // ok, 20/40
    { reference: 'verif8', status: 'PAIEMENT_A_VERIFIER', stageSince: ago(8) }, // orange, 8/10
    { reference: 'liv90', status: 'EN_LIVRAISON', stageSince: ago(90) }, // rouge, 90/60
    { reference: 'merci5', status: 'LIVREE', toThank: true, stageSince: ago(5) }, // ok, 5/120
    { reference: 'verif30', status: 'PAIEMENT_A_VERIFIER', stageSince: ago(30) }, // rouge, 30/10
    { reference: 'prep30', status: 'EN_PREPARATION', stageSince: ago(30) }, // orange, 30/40
  ].sort(byUrgency(NOW));
  assert.deepEqual(list.map((o) => o.reference), ['verif30', 'liv90', 'verif8', 'prep30', 'prep20', 'merci5']);
});

test('bandeau : en cours, en retard, à surveiller, messages à confirmer', () => {
  const orders = [
    { status: 'PAIEMENT_A_VERIFIER', stageSince: ago(12) },
    { status: 'EN_PREPARATION', stageSince: ago(30), noticePending: true },
    { status: 'EN_LIVRAISON', stageSince: ago(5) },
    { status: 'LIVREE', toThank: true, stageSince: ago(3), noticePending: true },
  ];
  assert.deepEqual(summary(orders, NOW), { total: 4, late: 1, warn: 1, notice: 2 });
});
