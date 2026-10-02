import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceItems } from '../src/services/pricing.js';

const cat = { isActive: true };
const finest = {
  id: 'finest', name: 'Finest', number: 7, isAvailable: true, category: cat, choices: [],
  variants: [{ id: 'f-menu', label: 'Menu', price: 5500 }, { id: 'f-seul', label: 'Burger seul', price: 4000 }],
};
const bucket = { id: 'bucket', name: 'Family Bucket', number: 26, isAvailable: true, category: cat, choices: [], variants: [{ id: 'b-std', label: 'Standard', price: 28000 }] };
const salad = {
  id: 'salad', name: 'Chicken Salad', number: 2, isAvailable: true, category: cat, choiceLabel: 'Cuisson du poulet', choices: ['Grillé', 'Frit'],
  variants: [{ id: 's-menu', label: 'Menu', price: 4500 }, { id: 's-seul', label: 'Salade seule', price: 4000 }],
};
const products = [finest, bucket, salad];

test('calcule le total à partir des prix en base', () => {
  const { lines, itemsTotal } = priceItems(
    [
      { productId: 'finest', variantId: 'f-menu', quantity: 2 },
      { productId: 'finest', variantId: 'f-seul', quantity: 1, note: 'Sans oignon' },
      { productId: 'bucket', variantId: 'b-std', quantity: 1 },
    ],
    products,
  );
  assert.equal(itemsTotal, 5500 * 2 + 4000 + 28000);
  assert.equal(lines[0].variantLabel, 'Menu');
  assert.equal(lines[2].variantLabel, null); // prix unique : pas de libellé
  assert.equal(lines[1].note, 'Sans oignon');
});

test('refuse un plat indisponible', () => {
  assert.throws(
    () => priceItems([{ productId: 'finest', variantId: 'f-menu', quantity: 1 }], [{ ...finest, isAvailable: false }]),
    (e) => e.status === 409 && e.code === 'PRODUIT_INDISPONIBLE',
  );
});

test('refuse un plat retiré du menu', () => {
  assert.throws(
    () => priceItems([{ productId: 'finest', variantId: 'f-menu', quantity: 1 }], [{ ...finest, archivedAt: new Date() }]),
    (e) => e.status === 409 && e.code === 'PRODUIT_INDISPONIBLE',
  );
});

test("refuse une variante d'un autre produit", () => {
  assert.throws(() => priceItems([{ productId: 'finest', variantId: 'b-std', quantity: 1 }], products), (e) => e.code === 'VARIANTE_INCONNUE');
});

test('exige un choix valide quand le produit en propose', () => {
  assert.throws(() => priceItems([{ productId: 'salad', variantId: 's-menu', quantity: 1 }], products), (e) => e.code === 'CHOIX_REQUIS');
  assert.throws(() => priceItems([{ productId: 'salad', variantId: 's-menu', quantity: 1, choice: 'Bouilli' }], products), (e) => e.code === 'CHOIX_REQUIS');
  const { lines } = priceItems([{ productId: 'salad', variantId: 's-menu', quantity: 1, choice: 'Frit' }], products);
  assert.equal(lines[0].choice, 'Frit');
});
