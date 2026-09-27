import { Link } from 'react-router-dom';
import { PageHead, Progress } from '../components/PageParts.jsx';
import { useCart, useCartDetails, MAX_QTY } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { formatPrice, plural } from '../utils/format.js';
import { photoBg } from '../utils/visuals.js';

const CRUMBS = [{ label: 'Accueil', to: '/' }, { label: 'Menu', to: '/menu' }, { label: 'Ma commande' }];

function EmptyCart() {
  return (
    <div className="empty-page">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.8l2.4 12.2h11.4l2-8.2H6.2" />
      </svg>
      <h2>Votre commande est vide</h2>
      <p>Parcourez le menu et ajoutez les plats de votre choix.</p>
      <Link className="btn btn-p" to="/menu">Voir le menu</Link>
    </div>
  );
}

function CartLine({ item }) {
  const { changeQty, remove } = useCart();
  const { product: p, quantity } = item;
  return (
    <div className="cp-line">
      <div className="th" style={{ background: photoBg(p.imageUrl) }}>{p.imageUrl && <img src={p.imageUrl} alt="" />}</div>
      <div>
        <b>{p.number != null && `N° ${p.number} · `}{p.name}</b>
        {item.options && <div className="v">{item.options}</div>}
        {!p.isAvailable && <div className="v" style={{ color: 'var(--bad)', fontWeight: 600 }}>Plus disponible pour le moment</div>}
        <button className="rm" onClick={() => remove(item.key)}>Retirer</button>
      </div>
      <span className="qty">
        <button onClick={() => changeQty(item.key, -1)} aria-label="Diminuer">−</button>
        <span>{quantity}</span>
        <button onClick={() => changeQty(item.key, 1)} disabled={quantity >= MAX_QTY} aria-label="Augmenter">+</button>
      </span>
      <div className="pr">{formatPrice(item.amount)}</div>
    </div>
  );
}

export default function Commande() {
  const { items, total, count, ready } = useCartDetails();
  const { status, error, reload, categories } = useMenu();

  let body;
  if (status === 'error') {
    body = (
      <div className="empty-page">
        <h2>Menu indisponible</h2><p>{error.message}</p>
        <button className="btn btn-p" onClick={reload}>Réessayer</button>
      </div>
    );
  } else if (!ready && count) {
    body = <div className="empty-page"><p>Chargement de votre commande…</p></div>;
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
    const blocked = items.some((i) => !i.product.isAvailable);

    body = (
      <div className="cartpage">
        <div>
          {groups.map((g) => (
            <section key={g.cat.id} className="cp-group">
              <h3>{g.cat.name}</h3>
              {g.items.map((item) => <CartLine key={item.key} item={item} />)}
            </section>
          ))}
          <Link className="btn btn-s" to="/menu">Ajouter d'autres plats</Link>
        </div>
        <aside className="box sum">
          <div className="box-h"><h2>Total</h2></div>
          <div className="box-b">
            <table><tbody>
              <tr><td>{plural(count, 'article')}</td><td>{formatPrice(total)}</td></tr>
              <tr><td>Livraison</td><td className="muted">Confirmée par l'équipe</td></tr>
              <tr className="tot"><td>Total des plats</td><td>{formatPrice(total)}</td></tr>
            </tbody></table>
            {blocked && <p className="err-line" style={{ marginTop: 12 }}>Retirez les plats indisponibles pour continuer.</p>}
            {blocked
              ? <button className="btn btn-p btn-block" style={{ marginTop: 16 }} disabled>Continuer</button>
              : <Link className="btn btn-p btn-block" style={{ marginTop: 16 }} to="/valider">Continuer</Link>}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <>
      <PageHead crumbs={CRUMBS} title="Ma commande">Vérifiez vos plats avant de renseigner vos informations.</PageHead>
      <div className="wrap pagebody">
        {items.length > 0 && <Progress step={1} />}
        {body}
      </div>
    </>
  );
}
