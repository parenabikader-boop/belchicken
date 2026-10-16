import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMenu } from '../context/MenuContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ProductDialog from '../components/ProductDialog.jsx';
import OrderBar from '../components/OrderBar.jsx';
import CartSheet from '../components/CartSheet.jsx';
import { useSimpleOrder } from '../utils/site.js';
import { searchProducts } from '../utils/product.js';
import { cardLayout, categoryBanner, sizedPhoto } from '../utils/visuals.js';
import { useT } from '../i18n/index.jsx';

const SearchIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

export default function Menu() {
  const { categorie } = useParams();
  const simpleOrder = useSimpleOrder(); // lot « Commande simplifiée »
  const menu = useMenu();
  const t = useT();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const closeDialog = useCallback(() => setOpenId(null), []);

  if (menu.status !== 'ready') {
    return (
      <div className="wrap menu-body">
        {menu.status === 'loading' ? (
          <div className="alert info" role="status"><span>{t.menu.loading}</span></div>
        ) : (
          <div className="alert err" role="alert" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>{t.error(menu.error)}</span>
            <button className="btn btn-s" style={{ padding: '8px 14px' }} onClick={menu.reload}>{t.common.retry}</button>
          </div>
        )}
      </div>
    );
  }

  const { categories } = menu;
  const current = categories.find((c) => c.slug === categorie);
  if (!current) return <Navigate to={`/menu/${categories[0].slug}`} replace />;

  const q = query.trim();
  const opened = openId && menu.products.get(openId);
  const openProduct = (p) => setOpenId(p.id);

  return (
    <div className="menu-page">
      <CategoryTabs categories={categories} current={current} query={query} setQuery={setQuery} />
      {/* key : le contenu est remonté à chaque changement de catégorie, ce qui rejoue le fondu */}
      <div className="cat-fade" key={q ? 'recherche' : current.slug}>
        {!q && <CategoryBanner category={current} />}
        <div className="wrap menu-body">
          {q ? <SearchResults categories={categories} query={q} onOpen={openProduct} /> : <Category categories={categories} current={current} onOpen={openProduct} />}
        </div>
      </div>
      {/* Lot « Commande simplifiée » : panneau « Ma commande » par-dessus le menu */}
      {simpleOrder ? <CartSheet /> : <OrderBar />}
      {opened && <ProductDialog key={opened.id} product={opened} onClose={closeDialog} />}
    </div>
  );
}

// Rangée d'onglets collée sous l'en-tête. La loupe au bout ouvre la recherche à la place des onglets.
function CategoryTabs({ categories, current, query, setQuery }) {
  const t = useT();
  const [searching, setSearching] = useState(false);
  const rowRef = useRef(null);

  // Garde l'onglet de la catégorie affichée visible dans la rangée
  useEffect(() => {
    const row = rowRef.current;
    const on = row?.querySelector('a.on');
    if (!row || !on) return;
    const r = row.getBoundingClientRect(), o = on.getBoundingClientRect();
    row.scrollLeft += o.left - r.left - (r.width - o.width) / 2;
  }, [current, searching]);

  const closeSearch = () => {
    setQuery('');
    setSearching(false);
  };

  return (
    <div className="tabs">
      <div className="wrap tabs-in">
        {searching ? (
          <>
            <label className="tsearch">
              <SearchIcon size={18} />
              <input
                type="search"
                autoFocus
                placeholder={t.menu.search}
                aria-label={t.menu.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              />
            </label>
            <button type="button" className="tbtn" onClick={closeSearch} aria-label={t.menu.closeSearch}>×</button>
          </>
        ) : (
          <>
            <nav className="trow" ref={rowRef} aria-label={t.menu.categories}>
              {categories.map((c) => (
                <Link key={c.id} to={`/menu/${c.slug}`} className={c.id === current.id ? 'on' : undefined} aria-current={c.id === current.id ? 'page' : undefined}>
                  {c.name}
                </Link>
              ))}
            </nav>
            <button type="button" className="tbtn" onClick={() => setSearching(true)} aria-label={t.menu.openSearch}>
              <SearchIcon size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Bandeau pleine largeur à la couleur de la catégorie, avec la photo du plat vedette à droite
function CategoryBanner({ category: c }) {
  const banner = categoryBanner(c);
  return (
    <div className="cat-banner">
      <div className="wrap cat-banner-in">
        <div className="cat-banner-txt">
          {banner?.script && <span className="cat-script">{banner.script}</span>}
          <h1>{c.name}</h1>
          {c.description && <p>{c.description}</p>}
        </div>
        {banner?.photo && <img className={`cat-banner-ph${banner.small ? ' small' : ''}`} {...sizedPhoto(banner.photo, 'banner')} alt="" />}
      </div>
    </div>
  );
}

function SearchResults({ categories, query, onOpen }) {
  const t = useT();
  const results = searchProducts(categories, query);
  return (
    <>
      <h2 className="cat-title">{t.menu.results(results.length, query)}</h2>
      {results.length ? (
        <div className="grid">
          {results.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} />)}
        </div>
      ) : (
        <div className="alert info"><span>{t.menu.noResult}</span></div>
      )}
    </>
  );
}

function Category({ categories, current: c, onOpen }) {
  const t = useT();
  const i = categories.indexOf(c);
  const prev = categories[(i - 1 + categories.length) % categories.length];
  const next = categories[(i + 1) % categories.length];
  const layout = cardLayout(c.slug);
  // Produits sans sous-groupe affichés à la fin, pour ne jamais en perdre un
  const groups = [...c.groups, { id: null, name: t.menu.others }]
    .map((g) => ({ ...g, items: c.products.filter((p) => (p.groupId ?? null) === g.id) }))
    .filter((g) => g.items.length);

  return (
    <>
      {groups.map((g) => (
        <section className="grp" key={g.id ?? 'autres'}>
          {groups.length > 1 && <div className="grp-h"><h3>{g.name}</h3>{g.note && <span>{g.note}</span>}</div>}
          <div className={`grid grid-${layout}`}>{g.items.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} layout={layout} />)}</div>
        </section>
      ))}
      <div className="pager">
        <Link className="lnk" to={`/menu/${prev.slug}`}>‹ {prev.name}</Link>
        <Link className="lnk" to={`/menu/${next.slug}`}>{next.name} ›</Link>
      </div>
    </>
  );
}
