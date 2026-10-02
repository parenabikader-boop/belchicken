import { AppError } from '../utils/AppError.js';

// Calcule les lignes et le total à partir des prix en base.
// Les prix envoyés par le client ne sont jamais utilisés.
// `products` : produits chargés avec { variants, category }.
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
    };
  });

  const itemsTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines, itemsTotal };
}
