import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterRecheck } from './session.js';

const READY = { status: 'ready', user: { id: 'u1', name: 'Patron', role: 'PATRON' }, error: null, features: { CAISSE: true } };

test('session toujours bonne : on reste sur la page, compte et fonctions à jour', () => {
  const next = afterRecheck(READY, { me: { user: { id: 'u1', name: 'Patron', role: 'PATRON' }, features: { CAISSE: false } } });
  assert.equal(next.status, 'ready');
  assert.deepEqual(next.features, { CAISSE: false });
});

test('vraie fin de session (401) : page de connexion', () => {
  assert.deepEqual(afterRecheck(READY, { error: { status: 401 } }), { status: 'anon', user: null, error: null, features: {} });
});

test('serveur injoignable, lent ou en erreur : l’écran ne bouge pas', () => {
  for (const status of [0, 500, 502, 503]) assert.equal(afterRecheck(READY, { error: { status } }), READY);
});

test('jamais l’écran « Vérification de la connexion… » pendant une revérification', () => {
  for (const r of [{ me: { user: READY.user } }, { error: { status: 401 } }, { error: { status: 0 } }]) {
    assert.notEqual(afterRecheck(READY, r).status, 'loading');
  }
});
