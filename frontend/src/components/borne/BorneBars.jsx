import { Link } from 'react-router-dom';
import { useCart, useCartDetails } from '../../context/CartContext.jsx';
import { formatPrice } from '../../utils/format.js';
import { LangSwitch, useT } from '../../i18n/index.jsx';

const SearchIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

// Lot 11 : barre fine du haut, à la place de l'en-tête du site (menu façon borne seulement) :
// petit logo (retour à l'accueil), loupe, FR / EN si le site en anglais est allumé, « Ma commande (n) ».
export function BorneTopBar({ searching, onSearch }) {
  const { count } = useCart();
  const t = useT();
  const L = t.layout;
  return (
    <header className="kb-top">
      <div className="kb-top-in">
        <Link className="kb-logo" to="/" aria-label={L.homeAria}>
          <span className="mark"><span>B</span></span>
          <b>Belchicken</b>
        </Link>
        <div className="kb-top-r">
          <button type="button" className={`kb-icon${searching ? ' on' : ''}`} onClick={onSearch} aria-pressed={searching}
            aria-label={searching ? t.menu.closeSearch : t.menu.openSearch}>
            <SearchIcon />
          </button>
          <LangSwitch />
          <Link className="kb-cart" to="/commande">
            {L.myOrder} <span className="n">{count}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

// Lot 11 : barre fine du bas, seulement quand le panier n'est pas vide
export function BorneOrderBar() {
  const { count, total, ready } = useCartDetails();
  const t = useT();
  if (!count || !ready) return null;
  return (
    <div className="kb-obar">
      <div className="kb-obar-in">
        <span className="kb-obar-sum">
          <b>{formatPrice(total)}</b>
          <span>{t.orderBar.count(count)}</span>
        </span>
        <Link className="btn btn-p" to="/commande">{t.orderBar.see}</Link>
      </div>
    </div>
  );
}
