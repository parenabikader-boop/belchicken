// Règles d'affichage des prix d'un produit, reprises de la maquette.

// Plusieurs formules qui ne sont pas « Menu / Seul » (tailles, pièces) : on affiche « Dès … »
export const isMultiSize = (p) => p.variants.length > 1 && p.variants[0].code !== 'menu';

export const displayPrice = (p) => (isMultiSize(p) ? Math.min(...p.variants.map((v) => v.price)) : p.variants[0].price);

// Ligne sous le prix : « Burger seul : 4 000 F », « L · XL », ou « 4 personnes »
export function priceSub(p, formatPrice) {
  const second = p.variants[1];
  if (second && second.code === 'seul') return `${second.label} : ${formatPrice(second.price)}`;
  if (p.variants.length > 1) return p.variants.map((v) => v.label.replace('Taille ', '')).join(' · ');
  return p.serves || '';
}

// Recherche par nom, numéro (« 7 », « N° 7 », « no 7 ») ou composition, sans tenir compte des accents
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function searchProducts(categories, query) {
  const q = fold(query).replace(/^n[°o]?\s*/, '');
  if (!q) return [];
  return categories.flatMap((c) =>
    c.products
      .filter((p) => fold(p.name).includes(q) || String(p.number ?? '') === q || fold(p.composition.join(' ')).includes(q))
      .map((p) => ({ ...p, category: c })),
  );
}
