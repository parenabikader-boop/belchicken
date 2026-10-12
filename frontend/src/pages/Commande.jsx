import { Link } from 'react-router-dom';
import { TunnelHead } from '../components/PageParts.jsx';
import { useCart, useCartDetails, MAX_QTY } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { formatPrice } from '../utils/format.js';
import { photoBg, sizedPhoto } from '../utils/visuals.js';
import { useT } from '../i18n/index.jsx';

function EmptyCart() {
  const t = useT();
  return (
    <div className="empty-page">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.8l2.4 12.2h11.4l2-8.2H6.2" />
      </svg>
      <h2>{t.cart.emptyTitle}</h2>
      <p>{t.cart.emptyText}</p>
      <Link className="btn btn-p" to="/menu">{t.common.seeMenu}</Link>
    </div>
  );
}

function CartLine({ item }) {
  const { changeQty, remove } = useCart();
  const t = useT();
  const { product: p, quantity } = item;
  return (
    <div className="cp-line">
      <div className="th" style={{ background: photoBg(p.imageUrl) }}>{p.imageUrl && <img {...sizedPhoto(p.imageUrl, 'thumb')} alt="" />}</div>
      <div>
        <b>{p.number != null && `${t.common.number(p.number)} · `}{p.name}</b>
        {item.options && <div className="v">{item.options}</div>}
        {item.problem && <div className="v" style={{ color: 'var(--bad)', fontWeight: 600 }}>{item.problem}</div>}
        <button className="rm" onClick={() => remove(item.key)}>{t.cart.remove}</button>
      </div>
      <span className="qty">
        <button onClick={() => changeQty(item.key, -1)} aria-label={t.common.decrease}>−</button>
        <span>{quantity}</span>
        <button onClick={() => changeQty(item.key, 1)} disabled={quantity >= MAX_QTY} aria-label={t.common.increase}>+</button>
      </span>
      <div className="pr">{formatPrice(item.amount)}</div>
    </div>
  );
}

export default function Commande() {
  const { items, total, count, ready } = useCartDetails();
  const { status, error, reload, categories } = useMenu();
  const t = useT();
  const C = t.cart;

  let body;
  if (status === 'error') {
    body = (
      <div className="empty-page">
        <h2>{t.common.menuUnavailable}</h2><p>{t.error(error)}</p>
        <button className="btn btn-p" onClick={reload}>{t.common.retry}</button>
      </div>
    );
  } else if (!ready && count) {
    body = <div className="empty-page"><p>{t.common.loadingOrder}</p></div>;
  } else if (!items.length) {
    body = <EmptyCart />;
  } else {
    // Regroupement par catégorie, dans l'ordre du menu
    const groups = [];
    for (const item of items) {
      const cat = item.product.category;
      let g = groups.find((x) => x.cat.id === cat.id);
      if (!g) groups.push((g = { cat, items: [] }));
      g.items.push(item);
    }
    const order = (g) => categories.findIndex((c) => c.id === g.cat.id);
    groups.sort((a, b) => order(a) - order(b));
    const blocked = items.some((i) => i.problem);

    body = (
      <div className="cartpage">
        <div>
          {groups.map((g) => (
            <section key={g.cat.id} className="cp-group">
              <h3>{g.cat.name}</h3>
              {g.items.map((item) => <CartLine key={item.key} item={item} />)}
            </section>
          ))}
          <Link className="lnk" to="/menu">{C.addMore}</Link>
        </div>
        <aside className="box sum">
          <div className="box-h"><h2>{C.total}</h2></div>
          <div className="box-b">
            <table><tbody>
              <tr><td>{C.articles(count)}</td><td>{formatPrice(total)}</td></tr>
              <tr><td>{C.delivery}</td><td className="muted">{C.deliveryNote}</td></tr>
              <tr className="tot"><td>{t.common.itemsTotal}</td><td>{formatPrice(total)}</td></tr>
            </tbody></table>
            {blocked && <p className="err-line" style={{ marginTop: 12 }}>{C.blocked}</p>}
            {blocked
              ? <button className="btn btn-p btn-block" style={{ marginTop: 16 }} disabled>{C.continue}</button>
              : <Link className="btn btn-p btn-block" style={{ marginTop: 16 }} to="/valider">{C.continue}</Link>}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <>
      <div className="wrap pagebody tunnel-body">
        <TunnelHead title={C.title} step={items.length > 0 ? 1 : null} />
        {body}
      </div>
    </>
  );
}
