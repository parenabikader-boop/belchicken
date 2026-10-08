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

// ─── Boissons choisies dans les formules ───
const drinksCat = { isActive: true, isDrinks: true };
const coca = { id: 'coca', name: 'Coca-Cola', isAvailable: true, category: drinksCat, choices: [], variants: [{ id: 'c-std', label: 'Standard', price: 1000 }] };
const fanta = { id: 'fanta', name: 'Fanta', isAvailable: true, category: drinksCat, choices: [], variants: [{ id: 'fa-std', label: 'Standard', price: 1000 }] };
const menuFinest = { ...finest, variants: [{ id: 'f-menu', label: 'Menu', price: 5500, drinkCount: 1 }, { id: 'f-seul', label: 'Burger seul', price: 4000, drinkCount: 0 }] };
const family = { ...bucket, variants: [{ id: 'b-std', label: 'Standard', price: 28000, drinkCount: 4 }] };
const withDrinks = [menuFinest, family, coca, fanta];

test('boissons : choisies dans la formule, sans supplément', () => {
  const { lines, itemsTotal } = priceItems(
    [
      { productId: 'finest', variantId: 'f-menu', quantity: 2, drinks: [{ productId: 'coca', quantity: 1 }] },
      { productId: 'bucket', variantId: 'b-std', quantity: 1, drinks: [{ productId: 'coca', quantity: 2 }, { productId: 'fanta', quantity: 1 }, { productId: 'coca', quantity: 1 }] },
    ],
    withDrinks,
  );
  assert.equal(itemsTotal, 5500 * 2 + 28000);
  assert.deepEqual(lines[0].drinks, [{ productId: 'coca', name: 'Coca-Cola', quantity: 1 }]);
  // Même boisson regroupée sur une ligne
  assert.deepEqual(lines[1].drinks, [{ productId: 'coca', name: 'Coca-Cola', quantity: 3 }, { productId: 'fanta', name: 'Fanta', quantity: 1 }]);
});

test('boissons : autant de choix que de boissons dans la formule', () => {
  const pick = (drinks, variantId = 'b-std', productId = 'bucket') => () => priceItems([{ productId, variantId, quantity: 1, drinks }], withDrinks);
  assert.throws(pick([{ productId: 'coca', quantity: 3 }]), (e) => e.code === 'BOISSONS_A_CHOISIR' && /vos 4 boissons/.test(e.message));
  assert.throws(pick([{ productId: 'coca', quantity: 5 }]), (e) => e.code === 'BOISSONS_A_CHOISIR');
  assert.throws(pick([], 'f-menu', 'finest'), (e) => e.code === 'BOISSONS_A_CHOISIR' && /votre boisson/.test(e.message));
  // Burger seul : pas de boisson comprise
  assert.throws(pick([{ productId: 'coca', quantity: 1 }], 'f-seul', 'finest'), (e) => e.code === 'BOISSON_EN_TROP');
  assert.deepEqual(priceItems([{ productId: 'finest', variantId: 'f-seul', quantity: 1 }], withDrinks).lines[0].drinks, []);
});

test('boissons : une boisson indisponible ou un plat qui n’est pas une boisson est refusé', () => {
  const order = (drinkId, products) => () =>
    priceItems([{ productId: 'finest', variantId: 'f-menu', quantity: 1, drinks: [{ productId: drinkId, quantity: 1 }] }], products);
  assert.throws(order('coca', [menuFinest, { ...coca, isAvailable: false }]), (e) => e.status === 409 && e.code === 'BOISSON_INDISPONIBLE');
  assert.throws(order('coca', [menuFinest, { ...coca, archivedAt: new Date() }]), (e) => e.code === 'BOISSON_INDISPONIBLE');
  assert.throws(order('bucket', withDrinks), (e) => e.code === 'BOISSON_INCONNUE');
  assert.throws(order('inconnue', withDrinks), (e) => e.code === 'BOISSON_INCONNUE');
});

test('boissons vendues seules : un plat comme un autre, au prix normal', () => {
  const { itemsTotal, lines } = priceItems([{ productId: 'fanta', variantId: 'fa-std', quantity: 3 }], withDrinks);
  assert.equal(itemsTotal, 3000);
  assert.deepEqual(lines[0].drinks, []);
});
