import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_QTY, useCart, useCartDetails } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { addedLabel, addedLine, WIDE_QUERY } from '../utils/simple-order.js';
import { useT } from '../i18n/index.jsx';

// Lot « Commande simplifiée » (interrupteur COMMANDE_SIMPLIFIEE), sur le menu classique et le menu façon borne :
//   - écran large (900 px et plus) : panneau « Votre commande » fixe à droite, toujours visible et mis à jour à chaque
//     ajout (plats, + et −, retirer, total, « Commander ») ;
//   - téléphone : barre fixe en bas « Commander · X articles · Y F », avec quelques secondes « + dernier plat ajouté » ;
//     au toucher, directement la page de commande (récapitulatif modifiable en haut).
// Remplace la barre et la page « Ma commande » d'avant.
const ADDED_MS = 3500;

// Écran large ? (suit le changement de taille ou d'orientation)
function useWide() {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY) : null;
  const [wide, setWide] = useState(() => Boolean(query?.matches));
  useEffect(() => {
    if (!query) return undefined;
    const onChange = (e) => setWide(e.matches);
    query.addEventListener('change', onChange);
    setWide(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []); // une seule fois
  return wide;
}

// Plats de la commande, avec + et −, retirer, et le prix de chaque ligne
export function Lines({ items }) {
  const { changeQty, remove } = useCart();
  const t = useT();
  return (
    <ul className="cs-lines">
      {items.map((i) => (
        <li key={i.key}>
          <div className="cs-l">
            <b>{i.product.name}</b>
            {i.options && <small>{i.options}</small>}
            {i.problem && <small className="cs-bad">{i.problem}</small>}
            <button type="button" className="cs-rm" onClick={() => remove(i.key)}>{t.cart.remove}</button>
          </div>
          <span className="qty cs-qty">
            <button type="button" onClick={() => changeQty(i.key, -1)} aria-label={t.common.decrease}>−</button>
            <span>{i.quantity}</span>
            <button type="button" onClick={() => changeQty(i.key, 1)} disabled={i.quantity >= MAX_QTY} aria-label={t.common.increase}>+</button>
          </span>
          <b className="cs-pr">{formatPrice(i.amount)}</b>
        </li>
      ))}
    </ul>
  );
}

// Total en grand et gros bouton « Commander »
function Footer({ items, total }) {
  const navigate = useNavigate();
  const t = useT();
  const blocked = items.some((i) => i.problem);
  return (
    <footer className="cs-foot">
      <div className="cs-tot"><span>{t.cart.total}</span><b>{formatPrice(total)}</b></div>
      {blocked && <p className="cs-bad">{t.cart.blocked}</p>}
      <button type="button" className="btn btn-p btn-block cs-go" disabled={blocked} onClick={() => navigate('/valider')}>{t.simple.order}</button>
    </footer>
  );
}

export default function CartSheet() {
  const { items, total, count, ready } = useCartDetails();
  const { lines } = useCart();
  const navigate = useNavigate();
  const wide = useWide();
  const t = useT();
  const S = t.simple;

  // Dernier plat ajouté, affiché quelques secondes dans la barre du téléphone
  const before = useRef(lines);
  const [addedKey, setAddedKey] = useState(null);
  useEffect(() => {
    const key = addedLine(before.current, lines);
    before.current = lines;
    if (!key) return undefined;
    setAddedKey(key);
    const timer = setTimeout(() => setAddedKey(null), ADDED_MS);
    return () => clearTimeout(timer);
  }, [lines]);

  // Écran large : le menu laisse la place au panneau de droite
  useEffect(() => {
    if (!wide) return undefined;
    document.body.classList.add('cs-has-side');
    return () => document.body.classList.remove('cs-has-side');
  }, [wide]);

  if (!ready) return null;

  if (wide) {
    return (
      <aside className="cs-side" aria-label={S.sideTitle}>
        <h2 className="cs-side-h">{S.sideTitle}</h2>
        {items.length === 0 ? <p className="cs-empty">{S.sideEmpty}</p> : (
          <>
            <Lines items={items} />
            <Footer items={items} total={total} />
          </>
        )}
      </aside>
    );
  }

  // Téléphone : la barre mène directement à la page de commande (récapitulatif modifiable en haut de la page)
  if (!count) return null;
  const added = addedLabel(items.find((i) => i.key === addedKey));
  return (
    <div className="cs-bar">
      <button type="button" className="btn btn-p cs-bar-btn" onClick={() => navigate('/valider')}>
        <span>{S.bar(count, formatPrice(total))}</span>
        {added && <small className="cs-added" aria-live="polite">{S.added(added)}</small>}
      </button>
    </div>
  );
}
