import { AppError } from '../utils/AppError.js';

// Calcule les lignes et le total à partir des prix en base.
// Les prix envoyés par le client ne sont jamais utilisés.
// `products` : produits chargés avec { variants, category }, boissons choisies comprises.
export function priceItems(items, products) {
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((it, index) => {
    const product = byId.get(it.productId);
    if (!product) {
      throw new AppError(400, "Un plat de votre commande n'existe plus. Actualisez le menu.", 'PRODUIT_INCONNU', { index });
    }
    if (!product.isAvailable || product.archivedAt || !product.category?.isActive) {
      throw new AppError(409, `« ${product.name} » n'est plus disponible pour le moment.`, 'PRODUIT_INDISPONIBLE', { index, productId: product.id });
    }
    const variant = product.variants.find((v) => v.id === it.variantId);
    if (!variant) {
      throw new AppError(400, `La formule choisie pour « ${product.name} » n'existe plus.`, 'VARIANTE_INCONNUE', { index });
    }

    let choice = null;
    if (product.choices?.length) {
      if (!it.choice || !product.choices.includes(it.choice)) {
        throw new AppError(400, `Précisez « ${product.choiceLabel || 'votre choix'} » pour ${product.name}.`, 'CHOIX_REQUIS', { index });
      }
      choice = it.choice;
    }

    const drinks = pickDrinks(it.drinks, variant.drinkCount ?? 0, product, byId, index);

    const unitPrice = variant.price;
    return {
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      productNumber: product.number ?? null,
      // Libellé de variante inutile quand il n'y a qu'un prix
      variantLabel: product.variants.length > 1 ? variant.label : null,
      choice,
      note: it.note ?? null,
      unitPrice,
      quantity: it.quantity,
      lineTotal: unitPrice * it.quantity,
      drinks,
    };
  });

  const itemsTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines, itemsTotal };
}

// Boissons incluses dans une formule (variant.drinkCount), au choix parmi les boissons disponibles,
// sans supplément : il en faut exactement autant que dans la formule. Pour UNE formule.
// Renvoie [{ productId, name, quantity }], une ligne par boisson.
function pickDrinks(wanted = [], count, product, byId, index) {
  const total = wanted.reduce((n, d) => n + d.quantity, 0);
  if (!count) {
    if (total) throw new AppError(400, `« ${product.name} » ne comprend pas de boisson. Ajoutez-la à part.`, 'BOISSON_EN_TROP', { index });
    return [];
  }
  if (total !== count) {
    const what = count === 1 ? 'votre boisson' : `vos ${count} boissons`;
    throw new AppError(400, `Choisissez ${what} pour « ${product.name} ».`, 'BOISSONS_A_CHOISIR', { index });
  }
  const merged = new Map();
  for (const d of wanted) {
    const drink = byId.get(d.productId);
    if (!drink || !drink.category?.isDrinks) {
      throw new AppError(400, "Une boisson choisie n'existe plus. Actualisez le menu.", 'BOISSON_INCONNUE', { index });
    }
    if (!drink.isAvailable || drink.archivedAt || !drink.category.isActive) {
      throw new AppError(409, `« ${drink.name} » n'est plus disponible pour le moment. Choisissez une autre boisson.`, 'BOISSON_INDISPONIBLE', { index, productId: drink.id });
    }
    const line = merged.get(drink.id) || { productId: drink.id, name: drink.name, quantity: 0 };
    line.quantity += d.quantity;
    merged.set(drink.id, line);
  }
  return [...merged.values()];
}
