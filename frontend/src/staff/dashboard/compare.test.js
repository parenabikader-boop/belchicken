import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareState, EARLY_MIN, pctText } from './compare.js';

test('début de journée : jamais « −100 % » en rouge, « trop tôt pour comparer »', () => {
  // 7 h : rien encore aujourd'hui, 2 commandes payées hier à la même heure
  assert.deepEqual(compareState({ now: 0, before: 15000, inProgress: true, basePaid: 2 }), { kind: 'early', pct: null });
  // Même chose quand la journée va bien : pas de pourcentage tant que la comparaison est trop maigre
  assert.equal(compareState({ now: 90000, before: 15000, inProgress: true, basePaid: EARLY_MIN - 1 }).kind, 'early');
});

test('assez de commandes à la même heure : la vraie comparaison, en rouge si ça baisse', () => {
  assert.deepEqual(compareState({ now: 0, before: 60000, inProgress: true, basePaid: EARLY_MIN }), { kind: 'bad', pct: -100 });
  assert.deepEqual(compareState({ now: 120000, before: 100000, inProgress: true, basePaid: 8 }), { kind: 'good', pct: 20 });
  assert.equal(compareState({ now: 100000, before: 100000, inProgress: true, basePaid: 8 }).kind, 'flat');
});

test('période terminée (hier, semaine dernière) : comparée telle quelle, même avec peu de commandes', () => {
  assert.deepEqual(compareState({ now: 0, before: 15000, inProgress: false, basePaid: 1 }), { kind: 'bad', pct: -100 });
  assert.equal(compareState({ now: 5, before: 0 }).kind, 'none');
});

test('annulations : une hausse est une mauvaise nouvelle', () => {
  assert.equal(compareState({ now: 6, before: 3, upIsBad: true }).kind, 'bad');
  assert.equal(compareState({ now: 1, before: 3, upIsBad: true }).kind, 'good');
});

test('texte du pourcentage', () => {
  assert.equal(pctText(12), '+12 %');
  assert.equal(pctText(-40), '−40 %');
});
