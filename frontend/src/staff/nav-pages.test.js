import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTitle, staffPages, teamHome } from './nav-pages.js';

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
    ['Commandes', 'Menu', 'Caisse', 'Frais de livraison', 'Tableau de bord', 'Équipe', 'Réglages', 'Accueil du site', 'Prestataire', 'Livraison', 'Comptes du Patron']); // Comptes du Patron : interrupteur COMPTE_PATRON_SIMPLE ouvert
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

test('page d’arrivée : Patron sur le Tableau de bord, Opérateur sur Commandes, seulement avec le réglage allumé', () => {
  const open = () => true;
  const noBoard = (k) => k !== 'TABLEAU_DE_BORD';
  assert.equal(teamHome({ role: 'PATRON', newOrdersPage: true, hasFeature: open }), '/equipe/tableau-de-bord');
  assert.equal(teamHome({ role: 'PATRON', newOrdersPage: true, hasFeature: noBoard }), '/equipe/commandes', 'Tableau de bord fermé par le Prestataire');
  assert.equal(teamHome({ role: 'OPERATEUR', newOrdersPage: true, hasFeature: open }), '/equipe/commandes');
  assert.equal(teamHome({ role: 'PRESTATAIRE', newOrdersPage: true, hasFeature: open }), '/equipe/commandes', 'comme avant');
  // Réglage éteint : comme avant pour tout le monde
  for (const role of ['PATRON', 'OPERATEUR', 'PRESTATAIRE']) assert.equal(teamHome({ role, newOrdersPage: false, hasFeature: open }), '/equipe/commandes');
});
