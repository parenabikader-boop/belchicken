import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allClear, nowSummary } from './now.js';

const NOW = new Date('2026-10-13T14:30:00Z').getTime();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const o = (status, min, extra = {}) => ({ status, stageSince: ago(min), createdAt: ago(min), ...extra });

test('maintenant : retards et messages avec les seuils de la page Commandes, compteurs du serveur', () => {
  const orders = [
    o('PAIEMENT_A_VERIFIER', 12), // rouge à 10 min
    o('PAIEMENT_A_VERIFIER', 6), // orange
    o('EN_PREPARATION', 45, { noticePending: true }), // rouge à 40 min
    o('PRETE_LIVRAISON', 3),
    o('EN_LIVRAISON', 10),
    o('LIVREE', 200, { toThank: true }), // à remercier depuis plus de 2 h : rouge
    o('LIVREE', 300), // déjà remerciée : ne compte pas
    o('ANNULEE', 500),
  ];
  // 7 paiements à vérifier au total (dont des commandes d'hier hors de la liste)
  const n = nowSummary(orders, { PAIEMENT_A_VERIFIER: 7, A_REMERCIER: 1 }, NOW);
  assert.deepEqual(n, { inProgress: 6, late: 3, warn: 1, notice: 1, toVerify: 7, toThank: 1 });
  assert.equal(allClear(n), false);
});

test('tout est à jour : aucune commande, aucun avis, aucune espèce chez les livreurs', () => {
  const n = nowSummary([], {}, NOW);
  assert.deepEqual(n, { inProgress: 0, late: 0, warn: 0, notice: 0, toVerify: 0, toThank: 0 });
  assert.equal(allClear(n), true);
  assert.equal(allClear(n, { reviewsToCall: 1 }), false);
  assert.equal(allClear(n, { cash: 1000 }), false);
  // Des commandes en cours, à l'heure : rien à faire non plus
  assert.equal(allClear(nowSummary([o('EN_PREPARATION', 5)], {}, NOW)), true);
});
