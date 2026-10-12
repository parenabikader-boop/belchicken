import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTitle, staffPages } from './nav-pages.js';

const all = () => true;
const labels = (o) => staffPages(o).map((p) => p.label);

test('Patron, tout ouvert : toutes ses pages, dans l’ordre demandé', () => {
  assert.deepEqual(labels({ role: 'PATRON', patron: true, hasFeature: all, chiffres: '/equipe/tableau-de-bord' }),
    ['Commandes', 'Menu', 'Caisse', 'Frais de livraison', 'Tableau de bord', 'Équipe', 'Réglages', 'Accueil du site', 'Relevé']);
});

test('Opérateur : Commandes, Menu, Caisse seulement', () => {
  assert.deepEqual(labels({ role: 'OPERATEUR', patron: false, hasFeature: all, chiffres: '/equipe/tableau-de-bord' }), ['Commandes', 'Menu', 'Caisse']);
});

test('Prestataire : pages du Patron, plus Prestataire et Livraison, sans Relevé (onglet de Livraison)', () => {
  assert.deepEqual(labels({ role: 'PRESTATAIRE', patron: true, hasFeature: all, chiffres: '/equipe/tableau-de-bord' }),
    ['Commandes', 'Menu', 'Caisse', 'Frais de livraison', 'Tableau de bord', 'Équipe', 'Réglages', 'Accueil du site', 'Prestataire', 'Livraison']);
});

test('interrupteurs fermés par le Prestataire : pages cachées comme avant', () => {
  const closed = new Set(['CAISSE', 'FRAIS_LIVRAISON', 'REGLAGES', 'RELEVE']);
  assert.deepEqual(labels({ role: 'PATRON', patron: true, hasFeature: (k) => !closed.has(k), chiffres: null }), ['Commandes', 'Menu', 'Équipe', 'Accueil du site']);
  assert.deepEqual(labels({ role: 'OPERATEUR', patron: false, hasFeature: (k) => !closed.has(k), chiffres: null }), ['Commandes', 'Menu']);
});

test('nom de la page dans la barre', () => {
  const pages = staffPages({ role: 'PATRON', patron: true, hasFeature: all, chiffres: '/equipe/ventes' });
  assert.equal(pageTitle('/equipe/commandes', pages), 'Commandes');
  assert.equal(pageTitle('/equipe/commandes-v2', pages), 'Commandes');
  assert.equal(pageTitle('/equipe/commandes/nouvelle', pages), 'Nouvelle commande');
  assert.equal(pageTitle('/equipe/commandes/BC-7KQ2M', pages), 'Commande');
  assert.equal(pageTitle('/equipe/menu/plats/abc', pages), 'Menu');
  assert.equal(pageTitle('/equipe/avis', pages), 'Tableau de bord');
  assert.equal(pageTitle('/equipe/frais-livraison', pages), 'Frais de livraison');
  assert.equal(pageTitle('/equipe/mot-de-passe', pages), 'Mon mot de passe');
  assert.equal(pageTitle('/equipe/alertes', pages), 'Alertes');
  assert.equal(pageTitle('/equipe/inconnue', pages), 'Espace équipe');
});
