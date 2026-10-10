// Lot 5b : qui a accès à chaque adresse de l'espace équipe (/api/staff). Le test parcourt TOUTES les
// adresses déclarées : une adresse ajoutée plus tard sans protection, ou ouverte par erreur au
// Responsable livraison, fait échouer le test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffRouter } from '../src/routes/staff.routes.js';
import { accessFor } from '../src/middlewares/staff-auth.js';

// "/^\/orders\/?(?=\/|$)/i" -> "/orders"
const mountPath = (layer) =>
  layer.regexp.source.replace('^', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');

// Toutes les adresses : méthode, chemin complet, et les protections qui s'appliquent (dans l'ordre)
function collect(router, prefix = '', inherited = []) {
  const routes = [];
  const guards = [...inherited];
  for (const layer of router.stack) {
    if (layer.route) {
      const own = layer.route.stack.map((l) => l.handle.staffAccess).filter(Boolean);
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: (prefix + layer.route.path).replace(/(.)\/$/, '$1'), guards: [...guards, ...own] });
      }
    } else if (layer.handle?.stack) {
      routes.push(...collect(layer.handle, prefix + mountPath(layer), guards));
    } else if (layer.handle?.staffAccess) {
      guards.push(layer.handle.staffAccess); // router.use(requireStaff(...)) : vaut pour les adresses qui suivent
    }
  }
  return routes;
}

const ROUTES = collect(staffRouter);
const user = (role) => ({ id: 'u', role, mustChangePassword: false });
const allowed = (route, role) => route.guards.every((g) => accessFor(user(role), g.roles, g) === 'ok');
const key = (r) => `${r.method} ${r.path}`;

// Adresses sans connexion : se connecter, se déconnecter
const PUBLIC = ['POST /login', 'POST /login/code', 'POST /logout'];

// Les seules adresses ouvertes au Responsable livraison
const RESPONSABLE_ALLOWED = (r) =>
  ['GET /me', 'POST /password'].includes(key(r)) || r.path === '/livraison' || r.path.startsWith('/livraison/');

test('la liste des adresses est bien lue (toutes les pages de l’espace équipe)', () => {
  assert.ok(ROUTES.length > 60, `${ROUTES.length} adresses seulement`);
  for (const p of ['GET /orders', 'GET /dashboard', 'GET /caisse', 'GET /menu', 'GET /livraison', 'GET /livraison/caisse', 'PUT /prestataire/livraison']) {
    assert.ok(ROUTES.some((r) => key(r) === p), `adresse ${p} introuvable`);
  }
});

test('chaque adresse est protégée par une connexion, sauf la connexion elle-même', () => {
  for (const r of ROUTES) {
    if (PUBLIC.includes(key(r))) continue;
    assert.ok(r.guards.length > 0, `${key(r)} n’est pas protégée`);
  }
});

test('Responsable livraison : refusé sur TOUTES les adresses, sauf sa page Livraison, « qui suis-je » et son mot de passe', () => {
  let refused = 0;
  for (const r of ROUTES) {
    if (PUBLIC.includes(key(r))) continue;
    if (RESPONSABLE_ALLOWED(r)) {
      assert.equal(allowed(r, 'RESPONSABLE_LIVRAISON'), true, `${key(r)} devrait lui être ouverte`);
    } else {
      assert.equal(allowed(r, 'RESPONSABLE_LIVRAISON'), false, `${key(r)} est ouverte au Responsable livraison`);
      refused += 1;
    }
  }
  assert.ok(refused > 50);
});

test('Responsable livraison : jamais les commandes, le tableau de bord, la caisse du restaurant ni le menu', () => {
  for (const p of ['/orders', '/dashboard', '/caisse', '/menu', '/home', '/team', '/reglages', '/provenances', '/frais-livraison', '/prestataire', '/courses', '/push']) {
    const list = ROUTES.filter((r) => r.path === p || r.path.startsWith(`${p}/`));
    assert.ok(list.length > 0, p);
    for (const r of list) assert.equal(allowed(r, 'RESPONSABLE_LIVRAISON'), false, key(r));
  }
});

test('page Livraison : Responsable livraison et Prestataire seulement (ni Patron, ni Opérateur, ni Livreur)', () => {
  const list = ROUTES.filter((r) => r.path.startsWith('/livraison'));
  assert.ok(list.length >= 9);
  for (const r of list) {
    assert.equal(allowed(r, 'RESPONSABLE_LIVRAISON'), true, key(r));
    assert.equal(allowed(r, 'PRESTATAIRE'), true, key(r));
    for (const role of ['PATRON', 'OPERATEUR', 'LIVREUR']) assert.equal(allowed(r, role), false, `${key(r)} ouverte à ${role}`);
  }
});

test('rien ne change pour les autres rôles : le Livreur reste sur ses courses, l’Opérateur sur les commandes', () => {
  const get = (p) => ROUTES.find((r) => key(r) === p);
  assert.equal(allowed(get('GET /courses'), 'LIVREUR'), true);
  assert.equal(allowed(get('PUT /courses/disponibilite'), 'LIVREUR'), true);
  assert.equal(allowed(get('GET /orders'), 'LIVREUR'), false);
  assert.equal(allowed(get('PUT /orders/livreurs/:id/disponibilite'), 'OPERATEUR'), true);
  assert.equal(allowed(get('GET /caisse'), 'OPERATEUR'), true);
  assert.equal(allowed(get('GET /dashboard'), 'OPERATEUR'), false);
  assert.equal(allowed(get('GET /dashboard'), 'PATRON'), true);
});
