import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCancel, nextStatus, transitionError } from '../src/services/order-status.js';
import { searchWhere, statusWhere } from '../src/services/staff-orders.service.js';
import { thanksWhere } from '../src/services/customer-messages.js';

test('parcours normal, une étape à la fois', () => {
  assert.equal(nextStatus('PAIEMENT_A_VERIFIER'), 'PAYEE');
  assert.equal(nextStatus('PAYEE'), 'EN_PREPARATION');
  assert.equal(nextStatus('EN_PREPARATION'), 'EN_LIVRAISON');
  assert.equal(nextStatus('EN_LIVRAISON'), 'LIVREE');
  assert.equal(nextStatus('LIVREE'), null);
  assert.equal(nextStatus('ANNULEE'), null);
  assert.equal(transitionError('PAIEMENT_A_VERIFIER', 'PAYEE'), null);
});

test("on ne saute pas d'étape et on ne revient pas en arrière", () => {
  assert.match(transitionError('PAIEMENT_A_VERIFIER', 'EN_PREPARATION'), /Passage impossible/);
  assert.match(transitionError('PAIEMENT_A_VERIFIER', 'LIVREE'), /Passage impossible/);
  assert.match(transitionError('EN_LIVRAISON', 'PAYEE'), /Passage impossible/);
  assert.match(transitionError('PAYEE', 'PAYEE'), /déjà « Payée »/);
  assert.equal(transitionError('PAYEE', 'INCONNU'), 'Statut inconnu.');
});

test('annulation : motif obligatoire, impossible une fois livrée ou déjà annulée', () => {
  assert.equal(transitionError('EN_PREPARATION', 'ANNULEE', 'Client injoignable'), null);
  assert.equal(transitionError('EN_PREPARATION', 'ANNULEE', ''), "Indiquez le motif de l'annulation.");
  assert.equal(transitionError('EN_PREPARATION', 'ANNULEE', '  '), "Indiquez le motif de l'annulation.");
  assert.match(transitionError('LIVREE', 'ANNULEE', 'Erreur'), /ne peut plus être annulée/);
  assert.equal(canCancel('ANNULEE'), false);
  assert.equal(canCancel('PAIEMENT_A_VERIFIER'), true);
});

test('filtres de la liste', () => {
  const active = { status: { in: ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON'] } };
  const thanks = thanksWhere();
  // En cours : les 4 étapes et les livrées à remercier ; l'historique (LIVREE) : livrées et remerciées
  assert.deepEqual(statusWhere(undefined), { OR: [active, thanks] });
  assert.deepEqual(statusWhere('A_REMERCIER'), thanks);
  assert.deepEqual(statusWhere('LIVREE'), { status: 'LIVREE', NOT: thanks });
  assert.deepEqual(statusWhere('TOUTES'), {});
  // Envoi automatique : pas d'étape « à remercier »
  assert.deepEqual(statusWhere(undefined, { auto: true }), active);
  assert.deepEqual(statusWhere('LIVREE', { auto: true }), { status: 'LIVREE' });
  assert.deepEqual(statusWhere('A_REMERCIER', { auto: true }), { id: { in: [] } });
  assert.throws(() => statusWhere('N_IMPORTE_QUOI'), /Filtre de statut inconnu/);
});

test('recherche par référence, nom ou téléphone', () => {
  assert.deepEqual(searchWhere(''), {});
  const ref = searchWhere('bc-k98');
  assert.deepEqual(ref.OR[0], { reference: { contains: 'BC-K98' } });
  assert.equal(ref.OR.length, 2); // pas assez de chiffres pour chercher un téléphone
  const tel = searchWhere('76 12 34 56');
  assert.ok(tel.OR.some((c) => c.customerPhone?.contains === '76123456'));
  assert.deepEqual(searchWhere('Awa').OR[1], { customerName: { contains: 'Awa', mode: 'insensitive' } });
});
