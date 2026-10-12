// Lot 11, menu façon borne : règles de borne.js (sections, suppléments, boissons comprises, prix, lignes du panier).
// Lancer : npm test (dans frontend/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addIncluded, addonSections, cartLines, dialogTotal, includedState, menuSections, removeIncluded, takesAddons } from './borne.js';

const v = (id, code, label, price, drinkCount = 0) => ({ id, code, label, price, drinkCount });
const burgers = {
  id: 'cb', slug: 'burgers', name: 'Burgers', isDrinks: false, groups: [{ id: 'g1', name: 'Originals' }, { id: 'g2', name: 'XL' }],
  products: [
    { id: 'smoky', name: 'Smoky', groupId: 'g1', isAvailable: true, imageUrl: '/menu/smoky.jpg', choices: [], variants: [v('smoky-m', 'menu', 'Menu', 5500, 1), v('smoky-s', 'seul', 'Burger seul', 4000)] },
    { id: 'xl', name: 'Smoky XL', groupId: 'g2', isAvailable: true, imageUrl: null, choices: [], variants: [v('xl-m', 'menu', 'Menu', 6500, 1)] },
  ],
};
const empty = { id: 'ce', slug: 'vide', name: 'Vide', isDrinks: false, groups: [], products: [] };
const extras = {
  id: 'cx', slug: 'extras', name: 'Extras', isDrinks: false,
  groups: [{ id: 'ga', name: 'Accompagnements' }, { id: 'gp', name: 'Poulet à la pièce' }, { id: 'gs', name: 'Sauces' }],
  products: [
    { id: 'frites', slug: 'frites', name: 'Frites', groupId: 'ga', isAvailable: true, imageUrl: null, variants: [v('fl', 'L', 'Taille L', 1000), v('fxl', 'XL', 'Taille XL', 1500)] },
    { id: 'rice', slug: 'fried-rice', name: 'Fried Rice', groupId: 'ga', isAvailable: true, imageUrl: null, variants: [v('r1', 'standard', 'Standard', 1500)] },
    { id: 'wings', slug: 'wings-piece', name: 'Wings', groupId: 'gp', isAvailable: true, imageUrl: null, variants: [v('w1', '1pc', '1 pièce', 1000), v('w4', '4pc', '4 pièces', 3500)] },
    { id: 'sauce', slug: 'sauce-supplementaire', name: 'Sauce supplémentaire', groupId: 'gs', isAvailable: false, imageUrl: null, variants: [v('s1', 'standard', 'Standard', 250)] },
  ],
};
const drinks = {
  id: 'cd', slug: 'boissons', name: 'Boissons', isDrinks: true, groups: [],
  products: [
    { id: 'coca', name: 'Coca-Cola', isAvailable: true, imageUrl: null, variants: [v('c1', 'standard', 'Standard', 1000)] },
    { id: 'eau', name: 'Babali (eau)', isAvailable: true, imageUrl: null, variants: [v('e1', 'standard', 'Standard', 500)] },
  ],
};
const categories = [burgers, empty, extras, drinks];
const smoky = { ...burgers.products[0], category: burgers };

test('page : une section par catégorie, une rangée par sous-groupe, sans catégorie vide', () => {
  const s = menuSections(categories);
  assert.deepEqual(s.map((x) => x.category.slug), ['burgers', 'extras', 'boissons']);
  assert.deepEqual(s[0].rows.map((r) => [r.name, r.items.length]), [['Originals', 1], ['XL', 1]]);
  // Une seule rangée : pas de sous-titre
  assert.deepEqual(s[2].rows.map((r) => r.name), [null]);
});

test('suppléments : Sauces, Frites, Boissons en plus, puis les autres sous-groupes ; section sans article disponible cachée', () => {
  const s = addonSections(categories, smoky);
  assert.deepEqual(s.map((x) => x.kind), ['frites', 'boissons', 'extras', 'extras']);
  assert.deepEqual(s.map((x) => x.title), ['Frites', 'Boissons en plus', 'Accompagnements', 'Poulet à la pièce']);
  assert.deepEqual(s[0].items.map((i) => [i.name, i.price]), [['Frites · L', 1000], ['Frites · XL', 1500]]);
  assert.ok(!s[2].items.some((i) => i.productId === 'frites'), 'frites pas en double dans les accompagnements');
  assert.deepEqual(s[3].items.map((i) => i.name), ['Wings · 1 pièce', 'Wings · 4 pièces']);
  // La sauce disponible fait apparaître la section Sauces, en premier
  const withSauce = categories.map((c) => (c === extras ? { ...extras, products: extras.products.map((p) => (p.id === 'sauce' ? { ...p, isAvailable: true } : p)) } : c));
  assert.equal(addonSections(withSauce, smoky)[0].kind, 'sauces');
});

test('pas de suppléments sur la fiche d’une boisson ou d’un Extra', () => {
  assert.equal(takesAddons({ ...drinks.products[0], category: drinks }), false);
  assert.equal(takesAddons({ ...extras.products[1], category: extras }), false);
  assert.deepEqual(addonSections(categories, { ...extras.products[0], category: extras }), []);
});

test('boissons comprises : choix compté, remplacé quand la formule n’en a qu’une', () => {
  let inc = {};
  assert.deepEqual(includedState(1, inc), { chosen: 0, missing: 1 });
  inc = addIncluded(inc, 'coca', 1);
  assert.deepEqual(inc, { coca: 1 });
  inc = addIncluded(inc, 'eau', 1);
  assert.deepEqual(inc, { eau: 1 });
  let four = {};
  for (let i = 0; i < 5; i++) four = addIncluded(four, 'coca', 4);
  assert.deepEqual(four, { coca: 4 }, 'jamais plus que la formule');
  four = removeIncluded(four, 'coca');
  assert.deepEqual(includedState(4, four), { chosen: 3, missing: 1 });
  assert.deepEqual(removeIncluded({ coca: 1 }, 'coca'), {});
});

test('prix affiché : formule × quantité + suppléments', () => {
  const sections = addonSections(categories, smoky);
  const extrasChosen = { [`frites:fxl`]: 1, [`coca:c1`]: 2 };
  assert.equal(dialogTotal(smoky.variants[0], 2, extrasChosen, sections), 5500 * 2 + 1500 + 2 * 1000);
  assert.equal(dialogTotal(smoky.variants[1], 1, {}, sections), 4000);
});

test('panier : le plat avec sa boisson comprise, puis chaque supplément en ligne à part, sans prix', () => {
  const sections = addonSections(categories, smoky);
  const lines = cartLines({
    product: smoky, variantId: 'smoky-m', choice: null, note: 'Sans oignon', qty: 2,
    included: { coca: 1 }, extras: { 'frites:fxl': 1, 'rice:r1': 0, 'eau:e1': 3, 'inconnu:x': 2 }, sections,
  });
  assert.deepEqual(lines, [
    { productId: 'smoky', variantId: 'smoky-m', choice: null, note: 'Sans oignon', quantity: 2, drinks: [{ productId: 'coca', quantity: 1 }] },
    { productId: 'frites', variantId: 'fxl', quantity: 1 },
    { productId: 'eau', variantId: 'e1', quantity: 3 },
  ]);
  assert.ok(lines.every((l) => !('price' in l) && !('unitPrice' in l)), 'jamais de prix envoyé');
});
