import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMenu } from './MenuContext.jsx';

const STORAGE_KEY = 'belchicken.panier.v1';
// Limite de l'API par ligne de commande
export const MAX_QTY = 50;
const cap = (n) => Math.min(MAX_QTY, n);
const CartContext = createContext(null);

// Le panier ne garde que des identifiants et des quantités : les noms et les prix
// affichés viennent toujours du menu chargé depuis l'API.
function readStorage() {
  try {
    const lines = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(lines) ? lines.filter((l) => l && l.productId && l.variantId && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState(readStorage);
  const { products, status } = useMenu();

  // Une fois le menu chargé, retire les lignes dont le plat ou la formule n'existe plus
  useEffect(() => {
    if (status !== 'ready') return;
    const exists = (l) => products.get(l.productId)?.variants.some((v) => v.id === l.variantId);
    setLines((ls) => (ls.every(exists) ? ls : ls.filter(exists)));
  }, [products, status]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* navigation privée ou stockage plein : le panier reste en mémoire */
    }
  }, [lines]);

  const value = useMemo(() => {
    // Même plat, même formule, même choix et même note = une seule ligne
    const add = ({ productId, variantId, choice = null, note = '', quantity = 1 }) => {
      note = note.trim();
      const key = [productId, variantId, choice || '', note].join('|');
      setLines((ls) =>
        ls.some((l) => l.key === key)
          ? ls.map((l) => (l.key === key ? { ...l, quantity: cap(l.quantity + quantity) } : l))
          : [...ls, { key, productId, variantId, choice, note, quantity: cap(quantity) }],
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
      const options = [];
      if (product.variants.length > 1) options.push(variant.label);
      if (l.choice) options.push(l.choice);
      if (l.note) options.push(`« ${l.note} »`);
      items.push({ ...l, product, variant, options: options.join(' · '), amount: variant.price * l.quantity });
    }
    const total = items.reduce((s, i) => s + i.amount, 0);
    return { items, total, count, ready: status === 'ready' };
  }, [lines, count, products, status]);
}
