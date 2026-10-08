// Boissons choisies dans une formule, pour UNE formule ([{ name, quantity }]), même règle que le serveur
// (backend/src/utils/drinks.js) : le texte donne le total de la ligne, quantité comprise.
export function drinksLabel(drinks, lineQuantity = 1) {
  if (!drinks?.length) return '';
  const total = drinks.reduce((n, d) => n + d.quantity, 0) * lineQuantity;
  return total === 1
    ? `Boisson : ${drinks[0].name}`
    : `Boissons : ${drinks.map((d) => `${d.quantity * lineQuantity} ${d.name}`).join(', ')}`;
}

// Boissons du menu (catégorie « Boissons »), disponibles ou non
export const menuDrinks = (categories) => categories.find((c) => c.isDrinks)?.products || [];
