// Lot 11, menu façon borne (façon A) : règles sans affichage, testées dans borne.test.js.
// - Sections de la page : une par catégorie, une rangée par sous-groupe (comme la page Menu actuelle).
// - Écran de personnalisation : Sauces, Frites, Boissons en plus, puis les autres sous-groupes des Extras, tirés du
//   menu de la base (aucune liste de plats écrite en dur, sauf le plat « Frites » mis à part comme sur la borne).
// - Les suppléments vont au panier en LIGNES À PART, comme les « boissons en plus » de la fiche actuelle : le site
//   n'envoie jamais de prix, le serveur les calcule (pricing.js).

export const EXTRAS_SLUG = 'extras';
export const FRIES_SLUG = 'frites';
export const MAX_QTY = 50; // comme le panier (CartContext.jsx)

// Page : [{ category, rows: [{ key, name, note, items }] }], sans catégorie vide
export function menuSections(categories, othersLabel = 'Autres') {
  return categories
    .map((category) => {
      const groups = [...(category.groups || []), { id: null, name: othersLabel }];
      const rows = groups
        .map((g) => ({ key: g.id ?? 'autres', name: g.name, note: g.note ?? null, items: category.products.filter((p) => (p.groupId ?? null) === g.id) }))
        .filter((r) => r.items.length);
      return { category, rows: rows.length > 1 ? rows : rows.map((r) => ({ ...r, name: null, note: null })) };
    })
    .filter((s) => s.rows.length);
}

// Un article proposé dans l'écran de personnalisation : une formule (taille) d'un plat
// « Taille L » -> « L », comme les cartes du menu (product.js)
const sizeLabel = (label) => label.replace(/^Taille /, '');
const optionOf = (p, v, multi) => ({
  key: `${p.id}:${v.id}`,
  productId: p.id,
  variantId: v.id,
  name: multi ? `${p.name} · ${sizeLabel(v.label)}` : p.name,
  label: sizeLabel(v.label),
  price: v.price,
  imageUrl: p.imageUrl || null,
  isAvailable: p.isAvailable,
});
const optionsOf = (p) => p.variants.map((v) => optionOf(p, v, p.variants.length > 1));

// Rien à ajouter sur la fiche d'une boisson ou d'un Extra (on les ajoute pour eux-mêmes)
export const takesAddons = (product) => !product.category?.isDrinks && product.category?.slug !== EXTRAS_SLUG;

// Sections de suppléments pour ce plat : [{ key, title, kind, items }]. kind : 'sauces', 'frites', 'boissons', 'extras'.
// Une section sans aucun article disponible n'est pas proposée.
export function addonSections(categories, product, { drinksTitle = 'Boissons en plus', othersLabel = 'Autres' } = {}) {
  if (!takesAddons(product)) return [];
  const extras = categories.find((c) => c.slug === EXTRAS_SLUG);
  const drinks = categories.find((c) => c.isDrinks);
  const sections = [];
  const fries = extras?.products.find((p) => p.slug === FRIES_SLUG);
  const groups = extras ? [...(extras.groups || []), { id: null, name: othersLabel }] : [];
  const byGroup = groups.map((g) => ({
    key: `g-${g.id ?? 'autres'}`,
    title: g.name,
    kind: /sauce/i.test(g.name) ? 'sauces' : 'extras',
    items: extras.products.filter((p) => (p.groupId ?? null) === g.id && p !== fries).flatMap(optionsOf),
  }));
  sections.push(...byGroup.filter((s) => s.kind === 'sauces'));
  if (fries) sections.push({ key: 'frites', title: fries.name, kind: 'frites', items: optionsOf(fries) });
  if (drinks) sections.push({ key: 'boissons', title: drinksTitle, kind: 'boissons', items: drinks.products.filter((p) => p.variants.length).map((p) => optionOf(p, p.variants[0], false)) });
  sections.push(...byGroup.filter((s) => s.kind === 'extras'));
  return sections.filter((s) => s.items.some((i) => i.isAvailable));
}

// Boissons comprises dans la formule : combien sont choisies, combien manquent
export function includedState(drinkCount, included) {
  const chosen = Object.values(included).reduce((n, c) => n + c, 0);
  return { chosen, missing: Math.max(0, drinkCount - chosen) };
}

// Toucher « + » sur une boisson comprise. Formule à une boisson : on remplace le choix (comme un bouton radio).
export function addIncluded(included, drinkId, drinkCount) {
  const { missing } = includedState(drinkCount, included);
  if (missing > 0) return { ...included, [drinkId]: (included[drinkId] || 0) + 1 };
  if (drinkCount === 1) return { [drinkId]: 1 };
  return included;
}

export function removeIncluded(included, drinkId) {
  const n = (included[drinkId] || 0) - 1;
  const next = { ...included };
  if (n > 0) next[drinkId] = n;
  else delete next[drinkId];
  return next;
}

// Prix affiché sur le bouton « Ajouter » (le serveur recalcule tout à la commande)
export function dialogTotal(variant, qty, extras, sections) {
  const items = new Map(sections.flatMap((s) => s.items.map((i) => [i.key, i])));
  return variant.price * qty + Object.entries(extras).reduce((s, [key, n]) => s + (items.get(key)?.price || 0) * n, 0);
}

// Lignes à mettre au panier : le plat (formule, choix, note, boissons comprises), puis chaque supplément à part
export function cartLines({ product, variantId, choice = null, note = '', qty, included = {}, extras = {}, sections = [] }) {
  const drinks = Object.entries(included).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const items = new Map(sections.flatMap((s) => s.items.map((i) => [i.key, i])));
  const lines = [{ productId: product.id, variantId, choice, note, quantity: qty, drinks }];
  for (const [key, n] of Object.entries(extras)) {
    const item = items.get(key);
    if (item && n > 0) lines.push({ productId: item.productId, variantId: item.variantId, quantity: Math.min(MAX_QTY, n) });
  }
  return lines;
}
