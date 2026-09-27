import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMenu } from '../context/MenuContext.jsx';
import { PageHead, Progress } from '../components/PageParts.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ProductDialog from '../components/ProductDialog.jsx';
import OrderBar from '../components/OrderBar.jsx';
import { searchProducts } from '../utils/product.js';

const SearchIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

export default function Menu() {
  const { categorie } = useParams();
  const menu = useMenu();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const closeDialog = useCallback(() => setOpenId(null), []);

  // Sur mobile, fait défiler la rangée de catégories jusqu'à la catégorie affichée
  useEffect(() => {
    const row = document.querySelector('.chips .row');
    const on = row?.querySelector('a.on');
    if (!row || !on) return;
    const r = row.getBoundingClientRect(), o = on.getBoundingClientRect();
    row.scrollLeft += o.left - r.left - (r.width - o.width) / 2;
  }, [categorie, menu.status]);

  const head = (
    <PageHead crumbs={[{ label: 'Accueil', to: '/' }, { label: 'Menu' }]} title="Menu">
      Choisissez une catégorie, puis ajoutez vos plats.
    </PageHead>
  );

  if (menu.status !== 'ready') {
    return (
      <>
        {head}
        <div className="wrap pagebody">
          <Progress step={0} />
          {menu.status === 'loading' ? (
            <div className="alert info" role="status"><span>Chargement du menu…</span></div>
          ) : (
            <div className="alert err" role="alert" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span>{menu.error.message}</span>
              <button className="btn btn-s" style={{ padding: '8px 14px' }} onClick={menu.reload}>Réessayer</button>
            </div>
          )}
        </div>
      </>
    );
  }

  const { categories } = menu;
  const current = categories.find((c) => c.slug === categorie);
  if (!current) return <Navigate to={`/menu/${categories[0].slug}`} replace />;

  const q = query.trim();
  const resetSearch = () => setQuery('');
  const opened = openId && menu.products.get(openId);
  const openProduct = (p) => setOpenId(p.id);

  const searchInput = (placeholder) => (
    <input type="search" placeholder={placeholder} aria-label="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} />
  );

  return (
    <>
      {head}
      <div className="wrap pagebody">
        <Progress step={0} />

        <div className="chips">
          <label className="search"><SearchIcon size={18} />{searchInput('Rechercher un plat ou un numéro')}</label>
          <div className="row">
            {categories.map((c) => (
              <Link key={c.id} to={`/menu/${c.slug}`} className={c.id === current.id && !q ? 'on' : undefined} onClick={resetSearch}>{c.name}</Link>
            ))}
          </div>
        </div>

        <div className="menu2">
          <nav className="side" aria-label="Catégories">
            <h3>Catégories</h3>
            <label className="search"><SearchIcon size={16} />{searchInput('Plat ou numéro')}</label>
            <ul>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link to={`/menu/${c.slug}`} className={c.id === current.id && !q ? 'on' : undefined} onClick={resetSearch}>
                    {c.name}<span>{c.products.length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="content">
            {q ? <SearchResults categories={categories} query={q} onOpen={openProduct} /> : <Category categories={categories} current={current} onOpen={openProduct} onNavigate={resetSearch} />}
          </div>
        </div>
      </div>

      <OrderBar />
      {opened && <ProductDialog key={opened.id} product={opened} onClose={closeDialog} />}
    </>
  );
}

function SearchResults({ categories, query, onOpen }) {
  const results = searchProducts(categories, query);
  return (
    <>
      <div className="cat-head"><div><h2>Résultats</h2><p>{results.length} résultat{results.length > 1 ? 's' : ''} pour « {query} »</p></div></div>
      {results.length ? (
        <div className="grid" style={{ marginTop: 20 }}>
          {results.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} />)}
        </div>
      ) : (
        <div className="alert info" style={{ marginTop: 20 }}><span>Aucun plat trouvé. Essayez un numéro, par exemple 7 ou 26.</span></div>
      )}
    </>
  );
}

function Category({ categories, current: c, onOpen, onNavigate }) {
  const i = categories.indexOf(c);
  const prev = categories[(i - 1 + categories.length) % categories.length];
  const next = categories[(i + 1) % categories.length];
  // Produits sans sous-groupe affichés à la fin, pour ne jamais en perdre un
  const groups = [...c.groups, { id: null, name: 'Autres' }]
    .map((g) => ({ ...g, items: c.products.filter((p) => (p.groupId ?? null) === g.id) }))
    .filter((g) => g.items.length);

  return (
    <>
      <div className="cat-head"><div><h2>{c.name}</h2>{c.description && <p>{c.description}</p>}</div></div>
      {groups.map((g) => (
        <section className="grp" key={g.id ?? 'autres'}>
          {groups.length > 1 && <div className="grp-h"><h3>{g.name}</h3>{g.note && <span>{g.note}</span>}</div>}
          <div className="grid">{g.items.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} />)}</div>
        </section>
      ))}
      <div className="pager">
        <Link to={`/menu/${prev.slug}`} onClick={onNavigate}><span>Précédent</span><b>‹ {prev.name}</b></Link>
        <Link to={`/menu/${next.slug}`} onClick={onNavigate}><span>Suivant</span><b>{next.name} ›</b></Link>
      </div>
    </>
  );
}
