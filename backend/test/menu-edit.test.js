import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorySchema, planVariants, productSchema, sameItems, slugify, uniqueSlug } from '../src/services/menu-edit.js';
import { accessFor } from '../src/middlewares/staff-auth.js';

test('slugify enlève accents et ponctuation', () => {
  assert.equal(slugify("Poulet frit à l'ail"), 'poulet-frit-a-l-ail');
  assert.equal(slugify('  Bœuf XL !! '), 'boeuf-xl');
  assert.equal(slugify('!!!'), 'element');
});

test('uniqueSlug ajoute un numéro si le nom est pris', () => {
  assert.equal(uniqueSlug('finest', ['smoky']), 'finest');
  assert.equal(uniqueSlug('finest', ['finest', 'finest-2']), 'finest-3');
});

test('planVariants garde, modifie, crée et supprime les formules', () => {
  const existing = [
    { id: 'v1', code: 'menu', label: 'Menu', price: 5500 },
    { id: 'v2', code: 'seul', label: 'Seul', price: 4000 },
  ];
  const plan = planVariants(existing, [
    { id: 'v1', label: 'Menu', price: 6000 },
    { label: 'Menu', subLabel: 'Grand', price: 7000 },
  ]);
  assert.deepEqual(plan.update, [{ id: 'v1', label: 'Menu', subLabel: null, price: 6000, position: 0 }]);
  assert.deepEqual(plan.create, [{ code: 'menu-2', label: 'Menu', subLabel: 'Grand', price: 7000, position: 1 }]);
  assert.deepEqual(plan.remove, ['v2']);
  assert.throws(() => planVariants(existing, [{ id: 'autre', label: 'X', price: 1 }]));
});

const valid = {
  name: ' Finest ', number: 7, categoryId: 'c1', groupId: '',
  composition: ['Burger', '', 'Frites'], variants: [{ label: 'Menu', price: 5500 }],
};

test('productSchema nettoie un plat valide', () => {
  const p = productSchema.parse(valid);
  assert.equal(p.name, 'Finest');
  assert.equal(p.groupId, null);
  assert.deepEqual(p.composition, ['Burger', 'Frites']);
  assert.equal(p.choiceLabel, null);
});

test('productSchema refuse prix absent, nul, à virgule ou formules en double', () => {
  const bad = (variants) => assert.throws(() => productSchema.parse({ ...valid, variants }));
  bad([]);
  bad([{ label: 'Menu', price: 0 }]);
  bad([{ label: 'Menu', price: 5500.5 }]);
  bad([{ label: 'Menu', price: '5500' }]);
  bad([{ label: 'Menu', price: 5500 }, { label: 'menu', price: 6000 }]);
});

test('productSchema : un choix demande sa question et deux possibilités', () => {
  assert.throws(() => productSchema.parse({ ...valid, choices: ['Grillé', 'Frit'] }));
  assert.throws(() => productSchema.parse({ ...valid, choiceLabel: 'Cuisson', choices: ['Grillé'] }));
  const p = productSchema.parse({ ...valid, choiceLabel: 'Cuisson', choices: ['Grillé', 'Frit'] });
  assert.deepEqual(p.choices, ['Grillé', 'Frit']);
});

test('categorySchema refuse deux sections du même nom', () => {
  assert.throws(() => categorySchema.parse({ name: 'Burgers', groups: [{ name: 'XL' }, { name: 'xl' }] }));
  assert.equal(categorySchema.parse({ name: 'Burgers' }).isActive, true);
});

test("sameItems vérifie qu'un nouvel ordre ne perd ni n'ajoute rien", () => {
  assert.equal(sameItems(['a', 'b', 'c'], ['c', 'a', 'b']), true);
  assert.equal(sameItems(['a', 'b', 'c'], ['a', 'b']), false);
  assert.equal(sameItems(['a', 'b'], ['a', 'a']), false);
  assert.equal(sameItems(['a', 'b'], ['a', 'x']), false);
});

test("droits du menu : l'Opérateur change la disponibilité, pas le reste", () => {
  const operateur = { role: 'OPERATEUR' };
  assert.equal(accessFor(operateur, ['PATRON', 'OPERATEUR']), 'ok'); // disponibilité
  assert.equal(accessFor(operateur, ['PATRON']), 'refuse'); // prix, création, suppression, photos
  assert.equal(accessFor({ role: 'PATRON' }, ['PATRON']), 'ok');
});
