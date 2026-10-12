import { useCart } from '../../context/CartContext.jsx';
import { formatPrice } from '../../utils/format.js';
import { displayPrice, isMultiSize } from '../../utils/product.js';
import { isWide, photoBg, photoProps } from '../../utils/visuals.js';
import { useT } from '../../i18n/index.jsx';

// Photos des cartes de la borne : largeur fixe, le navigateur choisit la taille
const CARD_PHOTO = [[320, 480, 640], '(max-width: 699px) 70vw, 240px'];
const OPTION_PHOTO = [[200, 320], '(max-width: 699px) 40vw, 150px'];

// Lot 11 : grande carte d'un plat (photo, nom, prix), toute la carte s'ouvre d'un toucher
export default function BorneCard({ product: p, onOpen }) {
  const { lines } = useCart();
  const t = useT();
  const added = lines.filter((l) => l.productId === p.id).reduce((s, l) => s + l.quantity, 0);
  const off = !p.isAvailable;

  let flag = null;
  if (off) flag = <span className="kb-flag off">{t.common.unavailable}</span>;
  else if (added) flag = <span className="kb-flag in">{t.card.added(added)}</span>;
  else if (p.isSpicy) flag = <span className="kb-flag hot">{t.common.spicy}</span>;

  return (
    <button type="button" className={`kb-card${off ? ' off' : ''}`} onClick={() => onOpen(p)} disabled={off}
      aria-label={off ? t.card.unavailableAria(p.name) : t.card.addAria(p.name)}>
      <span className="kb-ph" style={{ background: photoBg(p.imageUrl) }}>
        {p.imageUrl
          ? <img {...photoProps(p.imageUrl, ...CARD_PHOTO)} alt="" loading="lazy" className={isWide(p.imageUrl) ? 'wide' : undefined} />
          : <span className="kb-noimg">{t.card.photoSoon}</span>}
        {p.number != null && <span className="kb-num">{t.common.number(p.number)}</span>}
        {flag}
      </span>
      <span className="kb-body">
        <span className="kb-name">{p.name}</span>
        <span className="kb-price">{isMultiSize(p) ? t.card.from : ''}{formatPrice(displayPrice(p))}</span>
      </span>
    </button>
  );
}

// Lot 11 : petite carte de l'écran de personnalisation, avec son compteur − n +.
// price null : article compris dans la formule (« Comprise »).
export function OptionCard({ name, imageUrl, price, count, onAdd, onRemove, canAdd = true, available = true }) {
  const t = useT();
  return (
    <div className={`kb-oc${count ? ' on' : ''}${available ? '' : ' off'}`}>
      <span className="kb-oc-ph" style={{ background: photoBg(imageUrl) }}>
        {imageUrl ? <img {...photoProps(imageUrl, ...OPTION_PHOTO)} alt="" loading="lazy" /> : <span className="kb-noimg" aria-hidden="true">{name.charAt(0)}</span>}
      </span>
      <span className="kb-oc-name">{name}</span>
      <span className="kb-oc-price">{!available ? t.common.unavailable : price == null ? t.borne.free : `+ ${formatPrice(price)}`}</span>
      <span className="kb-count">
        <button type="button" onClick={onRemove} disabled={!count} className={count ? undefined : 'hide'} aria-label={t.dialog.removeOne(name)}>−</button>
        <span aria-live="polite">{count}</span>
        <button type="button" onClick={onAdd} disabled={!available || !canAdd} aria-label={t.dialog.addOne(name)}>+</button>
      </span>
    </div>
  );
}
