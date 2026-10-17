import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountsQuery, changeText, changeTone, hourWindow, isPatronSimple, patronTabs } from './patron-simple.js';

test('seul le Patron change, et seulement avec l’interrupteur ouvert', () => {
  assert.equal(isPatronSimple('PATRON', { COMPTE_PATRON_SIMPLE: true }), true);
  assert.equal(isPatronSimple('PATRON', {}), false);
  assert.equal(isPatronSimple('PRESTATAIRE', { COMPTE_PATRON_SIMPLE: true }), false);
  assert.equal(isPatronSimple('OPERATEUR', { COMPTE_PATRON_SIMPLE: true }), false);
});

test('5 onglets : Comptes, Menu, Frais, Équipe, Avis ; jamais Commandes, Caisse ni Réglages', () => {
  const all = patronTabs(() => true).map((t) => t.label);
  assert.deepEqual(all, ['Comptes', 'Menu', 'Frais', 'Équipe', 'Avis']);
  assert.deepEqual(patronTabs((k) => k !== 'AVIS' && k !== 'FRAIS_LIVRAISON').map((t) => t.label), ['Comptes', 'Menu', 'Équipe']);
});

test('période, évolution et heures montrées', () => {
  assert.deepEqual(accountsQuery('dates', '2026-10-01', '2026-10-10'), { periode: 'dates', du: '2026-10-01', au: '2026-10-10' });
  assert.deepEqual(accountsQuery('autre'), { periode: 'jour' });
  assert.equal(changeText(12), '+12 %');
  assert.equal(changeText(-8), '−8 %');
  assert.equal(changeText(null), null);
  assert.equal(changeTone(5), 'up');
  assert.equal(changeTone(5, true), 'down');
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 2 ? 1 : 0 }));
  const w = hourWindow(hours);
  assert.equal(w[0].hour, 2);
  assert.equal(w.at(-1).hour, 23);
});
