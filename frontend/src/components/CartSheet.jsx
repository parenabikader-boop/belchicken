import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MAX_QTY, useCart, useCartDetails } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { sheetAsked } from '../utils/simple-order.js';
import { useT } from '../i18n/index.jsx';

// Lot « Commande simplifiée » : barre fixe « Voir ma commande · X articles · Y F » en bas du menu. Au toucher, le
// panneau « Ma commande » s'ouvre par-dessus le menu, sans changer de page : plats, + et −, retirer, total, « Commander ».
// Remplace la barre et la page « Ma commande » quand l'interrupteur COMMANDE_SIMPLIFIEE est ouvert.
export default function CartSheet() {
  const { items, total, count, ready } = useCartDetails();
  const { changeQty, remove } = useCart();
  const [search, setSearch] = useSearchParams();
  const [open, setOpen] = useState(() => sheetAsked(search));
  const navigate = useNavigate();
  const t = useT();
  const S = t.simple;

  // /menu?panier=1 (là où mène l'ancienne page « Ma commande ») : panneau ouvert, puis l'adresse redevient /menu
  useEffect(() => {
    if (!sheetAsked(search)) return;
    setOpen(true);
    const next = new URLSearchParams(search);
    next.delete('panier');
    setSearch(next, { replace: true });
  }, [search, setSearch]);

  // Panneau ouvert : le menu derrière ne défile plus ; Échap ferme
  useEffect(() => {
    if (!open) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!ready) return null;
  const blocked = items.some((i) => i.problem);

  return (
    <>
      {count > 0 && !open && (
        <div className="cs-bar">
          <button type="button" className="btn btn-p cs-bar-btn" onClick={() => setOpen(true)}>{S.bar(count, formatPrice(total))}</button>
        </div>
      )}
      {open && (
        <div className="cs-overlay" role="dialog" aria-modal="true" aria-label={S.sheetTitle} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="cs-sheet">
            <header className="cs-head">
              <h2>{S.sheetTitle}</h2>
              <button type="button" className="cs-x" aria-label={S.close} onClick={() => setOpen(false)}>×</button>
            </header>
            {items.length === 0 ? (
              <p className="cs-empty">{S.empty}</p>
            ) : (
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
            )}
            {items.length > 0 && (
              <footer className="cs-foot">
                <div className="cs-tot"><span>{t.cart.total}</span><b>{formatPrice(total)}</b></div>
                {blocked && <p className="cs-bad">{t.cart.blocked}</p>}
                <button type="button" className="btn btn-p btn-block cs-go" disabled={blocked} onClick={() => navigate('/valider')}>{S.order}</button>
              </footer>
            )}
          </div>
        </div>
      )}
    </>
  );
}
