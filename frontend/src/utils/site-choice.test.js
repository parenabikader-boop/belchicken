import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMenuPath, kioskMenuState } from './site-choice.js';

test('menu choisi : la réponse du serveur fait foi', () => {
  assert.equal(kioskMenuState(null, { anglais: false, menuBorne: true }, true), true);
  assert.equal(kioskMenuState('1', { anglais: false, menuBorne: false }, true), false);
  assert.equal(kioskMenuState('0', { menuBorne: true }, true), true);
  assert.equal(kioskMenuState(null, { anglais: true }, true), false); // ancien serveur, sans menuBorne
});

test('menu choisi : en attendant la réponse, la dernière connue ; première visite = attendre', () => {
  assert.equal(kioskMenuState('1', null, false), true);
  assert.equal(kioskMenuState('0', null, false), false);
  assert.equal(kioskMenuState(null, null, false), null);
});

test('menu choisi : serveur injoignable = dernière réponse connue, sinon le menu actuel', () => {
  assert.equal(kioskMenuState('1', null, true), true);
  assert.equal(kioskMenuState(null, null, true), false);
});

test('adresses du menu', () => {
  for (const p of ['/menu', '/menu/', '/menu/burgers']) assert.equal(isMenuPath(p), true, p);
  for (const p of ['/', '/menus', '/menu-borne', '/commande', '/equipe/menu']) assert.equal(isMenuPath(p), false, p);
});
