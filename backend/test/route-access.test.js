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
function collect(router, prefix = '', inherited = [], inheritedFeatures = []) {
  const routes = [];
  const guards = [...inherited];
  const features = [...inheritedFeatures]; // interrupteurs du Prestataire (requireFeature)
  for (const layer of router.stack) {
    if (layer.route) {
      const own = layer.route.stack.map((l) => l.handle.staffAccess).filter(Boolean);
      const ownFeatures = layer.route.stack.map((l) => l.handle.staffFeature).filter(Boolean);
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: (prefix + layer.route.path).replace(/(.)\/$/, '$1'), guards: [...guards, ...own], features: [...features, ...ownFeatures] });
      }
    } else if (layer.handle?.stack) {
      routes.push(...collect(layer.handle, prefix + mountPath(layer), guards, features));
    } else if (layer.handle?.staffAccess) {
      guards.push(layer.handle.staffAccess); // router.use(requireStaff(...)) : vaut pour les adresses qui suivent
    } else if (layer.handle?.staffFeature) {
      features.push(layer.handle.staffFeature); // router.use(requireFeature(...))
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

// Les seules adresses ouvertes au Responsable livraison. Lot 5c : ses alertes sur téléphone (/push : activer,
// couper, essayer ; il ne reçoit que les siennes, commande prête ou sans livreur, voir push.service.js)
// Lot 5d : son relevé (page et Excel), jamais les conditions du contrat (/releve/conditions)
const RESPONSABLE_ALLOWED = (r) =>
  ['GET /me', 'POST /password', 'GET /releve', 'GET /releve/excel'].includes(key(r)) || r.path === '/livraison' || r.path.startsWith('/livraison/') || r.path === '/push' || r.path.startsWith('/push/');

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

test('Responsable livraison : refusé sur TOUTES les adresses, sauf sa page Livraison, son relevé, ses alertes, « qui suis-je » et son mot de passe', () => {
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
  for (const p of ['/orders', '/dashboard', '/caisse', '/menu', '/home', '/team', '/reglages', '/provenances', '/frais-livraison', '/prestataire', '/courses']) {
    const list = ROUTES.filter((r) => r.path === p || r.path.startsWith(`${p}/`));
    assert.ok(list.length > 0, p);
    for (const r of list) assert.equal(allowed(r, 'RESPONSABLE_LIVRAISON'), false, key(r));
  }
});

test('page Livraison : Responsable livraison et Prestataire seulement (ni Patron, ni Opérateur, ni Livreur)', () => {
  const list = ROUTES.filter((r) => r.path.startsWith('/livraison'));
  assert.ok(list.length >= 13);
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
  assert.equal(allowed(get('POST /orders/:reference/delivery-fee/verified'), 'OPERATEUR'), true); // vérifier le mobile money
  assert.equal(allowed(get('GET /dashboard'), 'OPERATEUR'), false);
  assert.equal(allowed(get('GET /dashboard'), 'PATRON'), true);
});

test('lot 5c : récupération et tournées, chacun sur ses adresses', () => {
  const get = (p) => ROUTES.find((r) => key(r) === p);
  assert.equal(allowed(get('POST /courses/:reference/recuperee'), 'LIVREUR'), true);
  assert.equal(allowed(get('POST /courses/:reference/recuperee'), 'RESPONSABLE_LIVRAISON'), false);
  for (const p of ['POST /orders/tournee', 'POST /orders/:reference/recuperee']) {
    assert.equal(allowed(get(p), 'OPERATEUR'), true, p);
    assert.equal(allowed(get(p), 'RESPONSABLE_LIVRAISON'), false, p);
    assert.equal(allowed(get(p), 'LIVREUR'), false, p);
  }
  for (const p of ['POST /livraison/tournees', 'PUT /livraison/courses/:reference/livreur', 'DELETE /livraison/courses/:reference/livreur', 'POST /livraison/courses/:reference/recuperee']) {
    assert.equal(allowed(get(p), 'RESPONSABLE_LIVRAISON'), true, p);
    assert.equal(allowed(get(p), 'OPERATEUR'), false, p);
  }
});

test('lot 5d : relevé et conditions du contrat, chacun ses droits', () => {
  const get = (p) => ROUTES.find((r) => key(r) === p);
  for (const p of ['GET /releve', 'GET /releve/excel']) {
    for (const role of ['PRESTATAIRE', 'RESPONSABLE_LIVRAISON', 'PATRON']) assert.equal(allowed(get(p), role), true, `${p} ${role}`);
    for (const role of ['OPERATEUR', 'LIVREUR']) assert.equal(allowed(get(p), role), false, `${p} ${role}`);
  }
  // Conditions : jamais le Responsable livraison, même en lecture
  assert.equal(allowed(get('GET /releve/conditions'), 'RESPONSABLE_LIVRAISON'), false);
  assert.equal(allowed(get('GET /releve/conditions'), 'PATRON'), true);
  assert.equal(allowed(get('GET /releve/conditions'), 'PRESTATAIRE'), true);
  for (const p of ['POST /releve/conditions', 'DELETE /releve/conditions/:id']) {
    assert.equal(allowed(get(p), 'PRESTATAIRE'), true, p);
    for (const role of ['PATRON', 'RESPONSABLE_LIVRAISON', 'OPERATEUR', 'LIVREUR']) assert.equal(allowed(get(p), role), false, `${p} ${role}`);
  }
});

test('lot 6 : ventes réservées au Patron et au Prestataire (jamais Opérateur, Livreur ni Responsable livraison)', () => {
  const list = ROUTES.filter((r) => r.path === '/ventes' || r.path.startsWith('/ventes/'));
  assert.deepEqual(list.map(key).sort(), ['GET /ventes', 'GET /ventes/excel']);
  for (const r of list) {
    for (const role of ['PATRON', 'PRESTATAIRE']) assert.equal(allowed(r, role), true, `${key(r)} ${role}`);
    for (const role of ['OPERATEUR', 'LIVREUR', 'RESPONSABLE_LIVRAISON']) assert.equal(allowed(r, role), false, `${key(r)} ouverte à ${role}`);
  }
});

test('lot 7 : avis réservés au Patron et au Prestataire ; le Responsable livraison a seulement sa note de livraison ; tout derrière AVIS', () => {
  const list = ROUTES.filter((r) => r.path === '/avis' || r.path.startsWith('/avis/'));
  assert.deepEqual(list.map(key).sort(), ['GET /avis', 'GET /avis/commande/:reference', 'POST /avis/:id/rappel']);
  for (const r of list) {
    for (const role of ['PATRON', 'PRESTATAIRE']) assert.equal(allowed(r, role), true, `${key(r)} ${role}`);
    for (const role of ['OPERATEUR', 'LIVREUR', 'RESPONSABLE_LIVRAISON']) assert.equal(allowed(r, role), false, `${key(r)} ouverte à ${role}`);
    assert.ok(r.features.includes('AVIS'), `${key(r)} sans l’interrupteur AVIS`);
  }
  const partner = ROUTES.find((r) => key(r) === 'GET /livraison/avis');
  assert.ok(partner.features.includes('AVIS'));
  for (const role of ['RESPONSABLE_LIVRAISON', 'PRESTATAIRE']) assert.equal(allowed(partner, role), true, role);
  for (const role of ['PATRON', 'OPERATEUR', 'LIVREUR']) assert.equal(allowed(partner, role), false, role);
  // Les ventes restent derrière VENTES (lecture des interrupteurs vérifiée)
  for (const r of ROUTES.filter((x) => x.path.startsWith('/ventes'))) assert.ok(r.features.includes('VENTES'), key(r));
});

test('tableau de bord, bloc « Aujourd’hui » : Patron et Prestataire seulement, derrière TABLEAU_DE_BORD', () => {
  const r = ROUTES.find((x) => key(x) === 'GET /dashboard/aujourdhui');
  assert.ok(r, 'adresse introuvable');
  for (const role of ['PATRON', 'PRESTATAIRE']) assert.equal(allowed(r, role), true, role);
  for (const role of ['OPERATEUR', 'LIVREUR', 'RESPONSABLE_LIVRAISON']) assert.equal(allowed(r, role), false, role);
  assert.ok(r.features.includes('TABLEAU_DE_BORD'));
});

test('« Espèces remises » : Patron et Prestataire seulement, jamais l’Opérateur (le call center ne touche jamais d’espèces)', () => {
  const r = ROUTES.find((x) => key(x) === 'POST /caisse/remises');
  assert.ok(r, 'adresse introuvable');
  for (const role of ['PATRON', 'PRESTATAIRE']) assert.equal(allowed(r, role), true, role);
  for (const role of ['OPERATEUR', 'LIVREUR', 'RESPONSABLE_LIVRAISON']) assert.equal(allowed(r, role), false, role);
});
