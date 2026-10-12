import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useMenu } from '../context/MenuContext.jsx';
import BorneCategories from '../components/borne/BorneCategories.jsx';
import BorneRow from '../components/borne/BorneRow.jsx';
import BorneCard from '../components/borne/BorneCard.jsx';
import BorneDialog from '../components/borne/BorneDialog.jsx';
import { BorneOrderBar, BorneTopBar } from '../components/borne/BorneBars.jsx';
import { menuSections } from '../utils/borne.js';
import { searchProducts } from '../utils/product.js';
import { useT } from '../i18n/index.jsx';
import '../borne.css';

// Lot 11 : menu façon borne de commande (façon A), adresse d'essai /menu-borne, sans lien depuis le site.
// Écran libre comme sur une borne : barre fine en haut (logo, loupe, « Ma commande »), pas d'en-tête ni de pied de
// page du site (route hors de Layout, App.jsx), barre fine du panier en bas seulement s'il n'est pas vide.
// UNE SEULE CATÉGORIE À LA FOIS (/menu-borne/:categorie, la première par défaut) : une rangée par sous-groupe, qui
// remplit la largeur ou glisse s'il y a plus de plats que la largeur. On change de catégorie seulement par la
// colonne ou la bande des catégories ; la page remonte alors en haut. Seule la recherche mélange les catégories.
// La page Menu actuelle (Menu.jsx), sa fiche (ProductDialog.jsx) et le reste du site ne changent pas.
export default function MenuBorne() {
  const { categorie } = useParams();
  const menu = useMenu();
  const t = useT();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const closeDialog = useCallback(() => setOpenId(null), []);
  const closeSearch = () => {
    setQuery('');
    setSearching(false);
  };

  useEffect(() => {
    document.title = t.layout.docTitle;
  }, [t]);

  // Nouvelle catégorie : la page remonte en haut
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [categorie]);

  return (
    <div className="kb-page">
      <BorneTopBar searching={searching} onSearch={() => (searching ? closeSearch() : setSearching(true))} />
      <Content menu={menu} t={t} categorie={categorie} searching={searching} query={query} setQuery={setQuery}
        closeSearch={closeSearch} onOpen={(p) => setOpenId(p.id)} />
      <BorneOrderBar />
      {openId && menu.products.get(openId) && <BorneDialog key={openId} product={menu.products.get(openId)} onClose={closeDialog} />}
    </div>
  );
}

function Content({ menu, t, categorie, searching, query, setQuery, closeSearch, onOpen }) {
  if (menu.status !== 'ready') {
    return (
      <div className="kb-wait">
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

  const sections = menuSections(menu.categories, t.menu.others);
  const current = sections.find((s) => s.category.slug === categorie);
  // Sans catégorie, ou catégorie inconnue : la première
  if (!current) return sections.length ? <Navigate to={`/menu-borne/${sections[0].category.slug}`} replace /> : null;

  const q = query.trim();
  const results = q ? searchProducts(menu.categories, q) : [];
  const c = current.category;

  return (
    <div className="kb">
      <BorneCategories categories={sections.map((s) => s.category)} active={q ? null : c.slug} onPick={closeSearch} />
      <main className="kb-main">
        {searching && (
          <div className="kb-search">
            <input type="search" autoFocus placeholder={t.menu.search} aria-label={t.menu.search} value={query}
              onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && closeSearch()} />
            <button type="button" onClick={closeSearch} aria-label={t.menu.closeSearch}>×</button>
          </div>
        )}

        {q ? (
          <section className="kb-sec" aria-labelledby="kb-res">
            <div className="kb-sec-h">
              <h1 className="kb-sec-title" id="kb-res">{t.menu.results(results.length, q)}</h1>
            </div>
            <p className="kb-res-note">{t.borne.allCategories}</p>
            {results.length ? (
              <BorneRow fit label={t.menu.results(results.length, q)}>
                {results.map((p) => <BorneCard key={p.id} product={p} onOpen={onOpen} />)}
              </BorneRow>
            ) : (
              <div className="alert info kb-noresult"><span>{t.menu.noResult}</span></div>
            )}
          </section>
        ) : (
          <section className="kb-sec" key={c.id} aria-labelledby={`kb-${c.slug}`}>
            <div className="kb-sec-h">
              {c.script && <span className="kb-script">{c.script}</span>}
              <h1 className="kb-sec-title" id={`kb-${c.slug}`}>{c.name}</h1>
            </div>
            {current.rows.map((r) => (
              <BorneRow fit key={r.key} title={r.name} note={r.note} label={r.name ? `${c.name} · ${r.name}` : c.name}>
                {r.items.map((p) => <BorneCard key={p.id} product={p} onOpen={onOpen} />)}
              </BorneRow>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
