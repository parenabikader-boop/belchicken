import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMenu } from './MenuContext.jsx';
import { drinksLabel } from '../utils/drinks.js';

const STORAGE_KEY = 'belchicken.panier.v1';
// Limite de l'API par ligne de commande
export const MAX_QTY = 50;
const cap = (n) => Math.min(MAX_QTY, n);
const CartContext = createContext(null);

// Le panier ne garde que des identifiants et des quantités : les noms et les prix
// affichés viennent toujours du menu chargé depuis l'API.
function readStorage(key) {
  try {
    const lines = JSON.parse(localStorage.getItem(key));
    return Array.isArray(lines) ? lines.filter((l) => l && l.productId && l.variantId && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

// storageKey : un autre panier, à part de celui du client (commande saisie par l'agent, espace équipe)
export function CartProvider({ children, storageKey = STORAGE_KEY }) {
  const [lines, setLines] = useState(() => readStorage(storageKey));
  const { products, status } = useMenu();

  // Une fois le menu chargé, retire les lignes dont le plat ou la formule n'existe plus
  useEffect(() => {
    if (status !== 'ready') return;
    const exists = (l) => products.get(l.productId)?.variants.some((v) => v.id === l.variantId);
    setLines((ls) => (ls.every(exists) ? ls : ls.filter(exists)));
  }, [products, status]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      /* navigation privée ou stockage plein : le panier reste en mémoire */
    }
  }, [lines, storageKey]);

  const value = useMemo(() => {
    // Même plat, même formule, même choix, mêmes boissons et même note = une seule ligne.
    // drinks : boissons choisies dans la formule, pour une formule ([{ productId, quantity }]).
    const add = ({ productId, variantId, choice = null, note = '', quantity = 1, drinks = [] }) => {
      note = note.trim();
      drinks = [...drinks].filter((d) => d.quantity > 0).sort((a, b) => a.productId.localeCompare(b.productId));
      const key = [productId, variantId, choice || '', note, drinks.map((d) => `${d.productId}x${d.quantity}`).join(',')].join('|');
      setLines((ls) =>
        ls.some((l) => l.key === key)
          ? ls.map((l) => (l.key === key ? { ...l, quantity: cap(l.quantity + quantity) } : l))
          : [...ls, { key, productId, variantId, choice, note, drinks, quantity: cap(quantity) }],
      );
    };
    const changeQty = (key, delta) =>
      setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: cap(l.quantity + delta) } : l)).filter((l) => l.quantity > 0));
    const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));
    // Sans effet sur un panier déjà vide (évite un rendu en boucle si on l'appelle dans un effet)
    const clear = () => setLines((ls) => (ls.length ? [] : ls));
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    return { lines, count, add, changeQty, remove, clear };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);

// Panier enrichi avec les données du menu (nom, formule, prix indicatif).
// Les lignes dont le plat ou la formule n'existe plus dans le menu sont ignorées.
export function useCartDetails() {
  const { lines, count } = useCart();
  const { products, status } = useMenu();
  return useMemo(() => {
    const items = [];
    for (const l of lines) {
      const product = products.get(l.productId);
      const variant = product?.variants.find((v) => v.id === l.variantId);
      if (!product || !variant) continue;
      // Boissons choisies : noms et disponibilité lus dans le menu
      const drinks = (l.drinks || []).map((d) => ({ ...d, product: products.get(d.productId) }));
      const named = drinks.filter((d) => d.product).map((d) => ({ name: d.product.name, quantity: d.quantity }));
      const options = [];
      if (product.variants.length > 1) options.push(variant.label);
      if (l.choice) options.push(l.choice);
      if (named.length) options.push(drinksLabel(named, l.quantity));
      if (l.note) options.push(`« ${l.note} »`);
      // Ce qui empêche de commander cette ligne (retirée par le client, pas en silence)
      const chosen = drinks.reduce((n, d) => n + d.quantity, 0);
      const offDrink = drinks.find((d) => d.product && !d.product.isAvailable);
      let problem = null;
      if (!product.isAvailable) problem = 'Plus disponible pour le moment';
      else if (chosen !== (variant.drinkCount || 0) || drinks.some((d) => !d.product)) problem = 'Formule modifiée : retirez ce plat, puis ajoutez-le à nouveau';
      else if (offDrink) problem = `${offDrink.product.name} n'est plus disponible : retirez ce plat et choisissez une autre boisson`;
      items.push({ ...l, product, variant, problem, options: options.join(' · '), amount: variant.price * l.quantity });
    }
    const total = items.reduce((s, i) => s + i.amount, 0);
    return { items, total, count, ready: status === 'ready' };
  }, [lines, count, products, status]);
}
