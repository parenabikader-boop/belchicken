import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { displayPrice, isMultiSize, priceSub } from '../utils/product.js';
import { isWide, photoBg } from '../utils/visuals.js';

export default function ProductCard({ product: p, onOpen }) {
  const { lines } = useCart();
  const added = lines.filter((l) => l.productId === p.id).reduce((s, l) => s + l.quantity, 0);
  const sub = priceSub(p, formatPrice);
  const off = !p.isAvailable;
  const open = off ? undefined : () => onOpen(p);

  let flag = null;
  if (off) flag = <span className="flag off">Indisponible</span>;
  else if (added) flag = <span className="flag in">{added} ajouté{added > 1 ? 's' : ''}</span>;
  else if (p.isSpicy) flag = <span className="flag hot">Épicé</span>;

  return (
    <article className={off ? 'card off' : 'card'} aria-disabled={off || undefined}>
      <div className="ph" style={p.imageUrl ? { background: photoBg(p.imageUrl) } : undefined} onClick={open}>
        {p.imageUrl
          ? <img src={p.imageUrl} alt={p.name} loading="lazy" className={isWide(p.imageUrl) ? 'wide' : undefined} />
          : <div className="noimg">Photo à venir</div>}
      </div>
      {p.number != null && <span className="num">N° {p.number}</span>}
      {flag}
      <div className="body">
        <h4>{p.name}</h4>
        {p.composition.length > 0 && <p className="incl">{p.composition.join(' · ')}</p>}
        <div className="foot">
          <div className="price">
            <b>{isMultiSize(p) ? 'Dès ' : ''}{formatPrice(displayPrice(p))}</b>
            {sub && <small>{sub}</small>}
          </div>
          <button className="add" onClick={open} disabled={off} aria-label={off ? `${p.name} indisponible` : `Ajouter ${p.name}`}>
            {off ? 'Indisponible' : 'Ajouter'}
          </button>
        </div>
      </div>
    </article>
  );
}
