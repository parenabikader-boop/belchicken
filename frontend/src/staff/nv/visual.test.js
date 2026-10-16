// Nouveau visuel : interrupteur fermé = l'ancien visuel est servi, sans rien charger du nouveau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  avgDelivery, bottomTabs, cardAction, greeting, initials, isNewVisual, MAX_TABS, ownTabs, progressStep, toneOf,
} from './visual.js';
import { staffPages } from '../nav-pages.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('interrupteur NOUVEAU_VISUEL : ouvert seulement si le serveur dit true', () => {
  assert.equal(isNewVisual({ NOUVEAU_VISUEL: true }), true);
  for (const features of [{ NOUVEAU_VISUEL: false }, {}, null, undefined, { NOUVEAU_VISUEL: 'true' }, { NOUVEAU_VISUEL: 1 }]) {
    assert.equal(isNewVisual(features), false, JSON.stringify(features));
  }
});

test('interrupteur fermé : l’ancien visuel est servi (barre, pages, détail, tableau de bord, courses)', () => {
  const app = source('../StaffApp.jsx');
  // Le nouveau visuel n'est jamais importé directement : seulement chargé à part, quand l'interrupteur est ouvert
  const nvImports = app.split('\n').filter((l) => l.includes("'./nv/"));
  assert.deepEqual(
    nvImports.map((l) => l.trim()),
    [
      "import { isNewVisual } from './nv/visual.js';",
      "const NvShell = lazy(() => import('./nv/NvShell.jsx'));",
      "const NvOrders = lazy(() => import('./nv/NvOrders.jsx'));",
      "const NvOrderDetail = lazy(() => import('./nv/NvOrderDetail.jsx'));",
      "const NvDashboard = lazy(() => import('./nv/NvDashboard.jsx'));",
    ],
  );
  // Chaque écran nouveau n'apparaît que derrière isNewVisual(features) ; sinon l'écran actuel
  assert.match(app, /return isNewVisual\(features\) \? <Suspense fallback=\{null\}><Nv \/><\/Suspense> : old;/);
  assert.match(app, /<Visual old=\{<OrderDetail \/>\} nv=\{NvOrderDetail\} \/>/);
  assert.match(app, /<Visual old=\{<Dashboard \/>\} nv=\{NvDashboard\} \/>/);
  assert.match(app, /if \(isNewVisual\(features\)\) return <Suspense fallback=\{null\}><NvOrders \/><\/Suspense>;\n {2}if \(!loaded\)/);
  assert.equal((app.match(/if \(isNewVisual\(features\)\) \{\n {4}return <Suspense fallback=\{null\}><NvShell /g) || []).length, 2); // équipe et livreur
  // Les écrans actuels restent servis tels quels
  for (const old of ['<OrdersList />', '<OrdersPage2 />', '<CoursesPage />', '<StaffNav unseen={unseen.size} chiffres={chiffres} />', 'className="st-nav"']) {
    assert.ok(app.includes(old), old);
  }
  // Le style du nouveau visuel est entièrement rangé sous .nv (rien ne s'applique à l'ancien visuel)
  const css = source('./theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = css.replace(/@media[^{]*\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
  for (const sel of selectors) {
    for (const part of sel.split(',')) assert.match(part.trim(), /^\.nv(?![\w-]*-)|^\.nv-|^\.nvd|^\.nvo|^\.nvdb|^\.nv\b/, part.trim());
  }
  assert.ok(!/@import/.test(css));
});

test('onglets en bas : 4 au plus, le dernier « Plus », pris dans les pages du rôle', () => {
  const all = () => true;
  const patron = staffPages({ role: 'PATRON', patron: true, hasFeature: all, chiffres: '/equipe/tableau-de-bord' });
  assert.deepEqual(bottomTabs('PATRON', patron).map((t) => t.label), ['Tableau de bord', 'Commandes', 'Menu', 'Plus']);
  const op = staffPages({ role: 'OPERATEUR', patron: false, hasFeature: all, chiffres: null });
  assert.deepEqual(bottomTabs('OPERATEUR', op).map((t) => t.label), ['Commandes', 'Menu', 'Caisse', 'Plus']);
  // Caisse fermée par le Prestataire : pas d'onglet Caisse
  const opNoCash = staffPages({ role: 'OPERATEUR', patron: false, hasFeature: (k) => k !== 'CAISSE', chiffres: null });
  assert.deepEqual(bottomTabs('OPERATEUR', opNoCash).map((t) => t.label), ['Commandes', 'Menu', 'Plus']);
  const presta = staffPages({ role: 'PRESTATAIRE', patron: true, hasFeature: all, chiffres: '/equipe/tableau-de-bord' });
  assert.deepEqual(bottomTabs('PRESTATAIRE', presta).map((t) => t.label), ['Commandes', 'Tableau de bord', 'Livraison', 'Plus']);
  for (const tabs of [bottomTabs('PATRON', patron), bottomTabs('OPERATEUR', op), ownTabs('courier'), ownTabs('delivery')]) {
    assert.ok(tabs.length <= MAX_TABS);
    assert.equal(tabs.at(-1).label, 'Plus');
  }
  assert.deepEqual(ownTabs('courier').map((t) => t.label), ['Courses', 'Alertes', 'Plus']);
});

test('affichage seulement : étapes, couleurs, textes des cartes', () => {
  assert.deepEqual(['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE', 'ANNULEE'].map(progressStep), [0, 1, 1, 2, 3, -1]);
  assert.equal(toneOf({ status: 'PAIEMENT_A_VERIFIER' }), 'orange');
  assert.equal(toneOf({ status: 'EN_LIVRAISON' }), 'blue');
  assert.equal(toneOf({ status: 'LIVREE' }), 'green');
  assert.equal(toneOf({ status: 'EN_PREPARATION' }, true), 'red');
  assert.equal(cardAction({ status: 'PAIEMENT_A_VERIFIER' }), 'Vérifier le paiement');
  assert.equal(cardAction({ status: 'PAIEMENT_A_VERIFIER', noticePending: true }), 'Prévenir le client');
  assert.equal(cardAction({ status: 'EN_LIVRAISON' }), null); // le livreur valide avec le code
  assert.equal(cardAction({ status: 'LIVREE', toThank: true, noticePending: true }), 'Remercier le client');
  assert.equal(initials('awa Traoré'), 'AT');
  assert.equal(initials('Issa (Démo)'), 'I');
  assert.equal(greeting(new Date('2026-10-14T19:00:00Z')), 'Bonsoir');
  assert.equal(greeting(new Date('2026-10-14T09:00:00Z')), 'Bonjour');
  assert.equal(avgDelivery([{ delivered: 3, avgMinutes: 20 }, { delivered: 1, avgMinutes: 40 }, { delivered: 2, avgMinutes: null }]), 25);
  assert.equal(avgDelivery([]), null);
});
