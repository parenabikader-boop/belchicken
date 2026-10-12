import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { displayPrice, isMultiSize, priceSub } from '../utils/product.js';
import { isWide, photoBg, sizedPhoto } from '../utils/visuals.js';
import { useT } from '../i18n/index.jsx';

// layout : 'big' (burgers, wraps, salades), 'wide' (plateaux et box, composition visible),
// 'row' (extras, liste compacte) ou 'std' (poulet)
export default function ProductCard({ product: p, onOpen, layout = 'std' }) {
  const { lines } = useCart();
  const t = useT();
  const T = t.card;
  const added = lines.filter((l) => l.productId === p.id).reduce((s, l) => s + l.quantity, 0);
  const sub = priceSub(p, formatPrice);
  const off = !p.isAvailable;
  const open = off ? undefined : () => onOpen(p);
  const isMenu = p.variants[0].code === 'menu';

  let flag = null;
  if (off) flag = <span className="flag off">{t.common.unavailable}</span>;
  else if (added) flag = <span className="flag in">{T.added(added)}</span>;
  else if (p.isSpicy) flag = <span className="flag hot">{t.common.spicy}</span>;

  const price = <b>{isMultiSize(p) ? T.from : ''}{formatPrice(displayPrice(p))}</b>;
  const addButton = (
    <button className="add" onClick={open} disabled={off} aria-label={off ? T.unavailableAria(p.name) : T.addAria(p.name)}>
      {off ? t.common.unavailable : T.add}
    </button>
  );

  if (layout === 'row') {
    return (
      <article className={`xrow${off ? ' off' : ''}`} aria-disabled={off || undefined}>
        <div className="xph" style={p.imageUrl ? { background: photoBg(p.imageUrl) } : undefined} onClick={open}>
          {p.imageUrl ? <img {...sizedPhoto(p.imageUrl, 'row')} alt="" loading="lazy" /> : <span>{T.photoSoon}</span>}
        </div>
        <div className="xbody">
          <h4>{p.name}</h4>
          {(sub || p.description) && <small>{sub || p.description}</small>}
          {flag}
        </div>
        <div className="xend">
          <div className="price">{price}</div>
          {addButton}
        </div>
      </article>
    );
  }

  return (
    <article className={`card card-${layout}${off ? ' off' : ''}`} aria-disabled={off || undefined}>
      <div className="ph" style={p.imageUrl ? { background: photoBg(p.imageUrl) } : undefined} onClick={open}>
        {p.imageUrl
          ? <img {...sizedPhoto(p.imageUrl, 'card')} alt={p.name} loading="lazy" className={isWide(p.imageUrl) ? 'wide' : undefined} />
          : <div className="noimg">{T.photoSoon}</div>}
      </div>
      {p.number != null && <span className="num">{t.common.number(p.number)}</span>}
      {flag}
      <div className="body">
        <h4>{p.name}</h4>
        {layout === 'wide' && p.composition.length > 0 ? (
          <ul className="compo">{p.composition.map((c) => <li key={c}>{c}</li>)}</ul>
        ) : (
          p.composition.length > 0 && <p className="incl">{p.composition.join(' · ')}</p>
        )}
        <div className="foot">
          <div className="price">
            {layout === 'big' && isMenu && <small className="lbl">{T.menuLabel}</small>}
            {price}
            {sub && <small>{sub}</small>}
          </div>
          {addButton}
        </div>
      </div>
    </article>
  );
}
