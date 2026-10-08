// Boissons choisies dans une formule, pour UNE formule ([{ name, quantity }]).
// Affichage du total de la ligne : « 2 Coca-Cola, 1 Fanta » pour 2 menus avec Coca-Cola et un Fanta en plus…
export function drinksText(drinks, lineQuantity = 1) {
  if (!drinks?.length) return '';
  return drinks.map((d) => `${d.quantity * lineQuantity} ${d.name}`).join(', ');
}

// « Boisson : Coca-Cola » (une seule) ou « Boissons : 2 Coca-Cola, 1 Fanta »
export function drinksLabel(drinks, lineQuantity = 1) {
  if (!drinks?.length) return '';
  const total = drinks.reduce((n, d) => n + d.quantity, 0) * lineQuantity;
  return total === 1 ? `Boisson : ${drinks[0].name}` : `Boissons : ${drinksText(drinks, lineQuantity)}`;
}
