import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, hashToken, newSessionToken, verifyPassword } from '../src/services/staff-auth.js';
import { accessFor, parseCookies, sessionCookie } from '../src/middlewares/staff-auth.js';

test('le mot de passe est haché, jamais stocké en clair, et vérifié', async () => {
  const hash = await hashPassword('Poulet-2026!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.ok(!hash.includes('Poulet-2026!'));
  assert.equal(await verifyPassword('Poulet-2026!', hash), true);
  assert.equal(await verifyPassword('poulet-2026!', hash), false);
});

test('deux comptes avec le même mot de passe ont des empreintes différentes (sel)', async () => {
  assert.notEqual(await hashPassword('memememe'), await hashPassword('memememe'));
});

test('une empreinte abîmée ou vide est refusée sans planter', async () => {
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'bcrypt$abc'), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('jetons de session : aléatoires, et seule leur empreinte est gardée', () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a), hashToken(a));
});

test('lit le cookie de session parmi les autres', () => {
  assert.deepEqual(parseCookies('theme=clair; bc_equipe=abc%2D1; x'), { theme: 'clair', bc_equipe: 'abc-1' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('cookie httpOnly, limité à /api/staff, effacé à la déconnexion', () => {
  const set = sessionCookie('tok', new Date('2026-10-15T00:00:00Z'));
  assert.match(set, /^bc_equipe=tok; Path=\/api\/staff; HttpOnly; SameSite=Lax; Expires=Thu, 15 Oct 2026/);
  assert.match(sessionCookie('', null), /bc_equipe=; .*Max-Age=0/);
});

test('accès : non connecté, opérateur sur une page patron, patron partout', () => {
  const patron = { role: 'PATRON' };
  const operateur = { role: 'OPERATEUR' };
  assert.equal(accessFor(null, []), 'non-connecte');
  assert.equal(accessFor(operateur, []), 'ok');
  assert.equal(accessFor(operateur, ['PATRON']), 'refuse');
  assert.equal(accessFor(patron, ['PATRON']), 'ok');
});
