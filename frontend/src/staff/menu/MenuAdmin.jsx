import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import { useStaff } from '../StaffContext.jsx';

// Menu de l'espace équipe. Toute l'équipe : disponibilité d'un plat en un clic.
// Patron : en plus, modifier, ajouter, ordonner et retirer plats et catégories.
export default function MenuAdmin() {
  const { user } = useStaff();
  const isPatron = user.role === 'PATRON';
  const [params, setParams] = useSearchParams();
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setMenu(await staffApi.menu());
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const categories = menu?.categories || [];
  const unavailable = useMemo(() => categories.flatMap((c) => c.products.filter((p) => !p.isAvailable)), [categories]);
  const filter = params.get('categorie') || categories[0]?.slug;
  const q = search.trim().toLowerCase();

  const choose = (slug) => {
    setSearch('');
    setParams(slug === categories[0]?.slug ? {} : { categorie: slug }, { replace: true });
  };

  // Mise à jour immédiate à l'écran, annulée si l'API refuse
  const patchProduct = (id, change) =>
    setMenu((m) => ({ ...m, categories: m.categories.map((c) => ({ ...c, products: c.products.map((p) => (p.id === id ? { ...p, ...change } : p)) })) }));

  const toggle = async (p) => {
    const next = !p.isAvailable;
    patchProduct(p.id, { isAvailable: next, saving: true });
    try {
      await staffApi.setAvailability(p.id, next);
      patchProduct(p.id, { saving: false });
      setNotice(`« ${p.name} » est maintenant ${next ? 'disponible' : 'indisponible'} sur le site.`);
    } catch (e) {
      patchProduct(p.id, { isAvailable: p.isAvailable, saving: false });
      setError(e);
    }
  };

  // Monte ou descend un plat à l'intérieur de sa section
  const moveProduct = async (category, p, dir) => {
    const list = [...category.products];
    const i = list.findIndex((x) => x.id === p.id);
    let j = i + dir;
    while (j >= 0 && j < list.length && (list[j].groupId ?? null) !== (p.groupId ?? null)) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setMenu((m) => ({ ...m, categories: m.categories.map((c) => (c.id === category.id ? { ...c, products: list } : c)) }));
    try {
      await staffApi.reorderProducts(category.id, list.map((x) => x.id));
    } catch (e) {
      setError(e);
      load();
    }
  };

  const moveCategory = async (category, dir) => {
    const list = [...categories];
    const i = list.findIndex((c) => c.id === category.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setMenu((m) => ({ ...m, categories: list }));
    try {
      await staffApi.reorderCategories(list.map((c) => c.id));
    } catch (e) {
      setError(e);
      load();
    }
  };

  const restore = async (p) => {
    try {
      await staffApi.restoreProduct(p.id);
      setNotice(`« ${p.name} » est remis au menu, indisponible : vérifiez sa fiche puis rendez-le disponible.`);
      load();
    } catch (e) {
      setError(e);
    }
  };

  if (!menu) {
    return (
      <>
        <h1 className="st-title">Menu</h1>
        {error ? <div className="alert err" role="alert" style={{ marginTop: 12 }}><span>{error.message}</span></div> : <p className="st-muted">Chargement du menu…</p>}
      </>
    );
  }

  const results = q
    ? categories.flatMap((c) => c.products.filter((p) => p.name.toLowerCase().includes(q) || String(p.number ?? '') === q).map((p) => ({ p, c })))
    : null;
  const current = filter === 'indisponibles' ? null : categories.find((c) => c.slug === filter) || categories[0];

  return (
    <>
      <div className="st-head">
        <h1 className="st-title">Menu</h1>
        {isPatron && (
          <div className="mn-head-actions">
            <Link className="btn btn-s mn-btn" to="/equipe/menu/categories/nouvelle">+ Catégorie</Link>
            <Link className="btn btn-p mn-btn" to={`/equipe/menu/plats/nouveau${current ? `?categorie=${current.id}` : ''}`}>+ Plat</Link>
          </div>
        )}
      </div>
      <p className="st-muted mn-intro">
        Touchez l'interrupteur pour rendre un plat indisponible : il reste visible sur le site, grisé, et ne peut plus être commandé.
      </p>

      {error && <div className="alert err" role="alert" style={{ margin: '12px 0' }}><span>{error.message}</span></div>}
      {notice && !error && <div className="alert ok mn-notice" role="status"><span>{notice}</span></div>}

      <label className="st-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="Nom ou numéro du plat" aria-label="Rechercher un plat" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {!q && (
        <nav className="st-chips" aria-label="Catégories">
          {categories.map((c) => (
            <button key={c.id} type="button" className={`st-chip${c === current ? ' on' : ''}`} aria-pressed={c === current} onClick={() => choose(c.slug)}>
              {c.name}
              {!c.isActive && <em className="mn-hidden-tag">masquée</em>}
              <span>{c.products.length}</span>
            </button>
          ))}
          <button type="button" className={`st-chip${!current ? ' on' : ''}${unavailable.length ? ' warn' : ''}`} aria-pressed={!current} onClick={() => choose('indisponibles')}>
            Indisponibles<span>{unavailable.length}</span>
          </button>
        </nav>
      )}

      {q ? (
        <section className="mn-cat">
          <h2 className="mn-section">{results.length} résultat{results.length > 1 ? 's' : ''} pour « {search.trim()} »</h2>
          <ProductRows items={results} isPatron={isPatron} onToggle={toggle} showCategory />
        </section>
      ) : !current ? (
        <section className="mn-cat">
          {unavailable.length === 0 ? (
            <div className="st-empty"><b>Tous les plats sont disponibles</b><p>Les plats rendus indisponibles apparaîtront ici.</p></div>
          ) : (
            <ProductRows items={categories.flatMap((c) => c.products.filter((p) => !p.isAvailable).map((p) => ({ p, c })))} isPatron={isPatron} onToggle={toggle} showCategory />
          )}
        </section>
      ) : (
        <CategoryPanel
          category={current}
          isPatron={isPatron}
          isFirst={categories[0] === current}
          isLast={categories[categories.length - 1] === current}
          onToggle={toggle}
          onMoveProduct={moveProduct}
          onMoveCategory={moveCategory}
        />
      )}

      {isPatron && menu.archived.length > 0 && !q && (
        <details className="mn-archived">
          <summary>Plats retirés du menu ({menu.archived.length})</summary>
          <p className="st-muted">Déjà commandés, ils sont gardés pour l'historique des commandes. Ils n'apparaissent plus sur le site.</p>
          <ul>
            {menu.archived.map((p) => (
              <li key={p.id}>
                <span>{p.number != null && <b>N° {p.number} · </b>}{p.name}</span>
                <button type="button" className="st-text-btn" onClick={() => restore(p)}>Remettre au menu</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function CategoryPanel({ category: c, isPatron, isFirst, isLast, onToggle, onMoveProduct, onMoveCategory }) {
  // Produits sans section affichés à la fin, comme sur le site
  const groups = [...c.groups, { id: null, name: 'Autres' }]
    .map((g) => ({ ...g, items: c.products.filter((p) => (p.groupId ?? null) === g.id) }))
    .filter((g) => g.items.length || (g.id && isPatron));

  return (
    <section className="mn-cat">
      <div className="mn-cat-head">
        <div>
          {c.script && <span className="mn-script">{c.script}</span>}
          <h2>{c.name}</h2>
          {!c.isActive && <p className="mn-warn">Catégorie masquée : invisible sur le site.</p>}
        </div>
        {isPatron && (
          <div className="mn-cat-actions">
            <Arrows label={`la catégorie ${c.name}`} upDisabled={isFirst} downDisabled={isLast} onMove={(dir) => onMoveCategory(c, dir)} />
            <Link className="btn btn-s mn-btn" to={`/equipe/menu/categories/${c.id}`}>Modifier la catégorie</Link>
          </div>
        )}
      </div>

      {c.products.length === 0 && (
        <div className="st-empty"><b>Aucun plat dans cette catégorie</b>{isPatron && <p>Ajoutez-en un avec « + Plat ».</p>}</div>
      )}

      {groups.map((g) => (
        <div key={g.id ?? 'autres'} className="mn-group">
          {(groups.length > 1 || g.id) && <h3 className="mn-section">{g.name}{g.note && <span>{g.note}</span>}</h3>}
          {g.items.length === 0 ? (
            <p className="st-muted mn-none">Aucun plat dans cette section.</p>
          ) : (
            <ProductRows
              items={g.items.map((p) => ({ p, c }))}
              isPatron={isPatron}
              onToggle={onToggle}
              onMove={(p, dir) => onMoveProduct(c, p, dir)}
            />
          )}
        </div>
      ))}
    </section>
  );
}

function ProductRows({ items, isPatron, onToggle, onMove, showCategory }) {
  return (
    <ul className="mn-list">
      {items.map(({ p, c }, i) => (
        <li key={p.id} className={`mn-row${p.isAvailable ? '' : ' off'}`}>
          <div className="mn-th">{p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span>Photo à venir</span>}</div>
          <div className="mn-info">
            <b>{p.number != null && <span className="mn-num">N° {p.number}</span>}{p.name}</b>
            <small>{p.variants.map((v) => (p.variants.length > 1 ? `${v.label} ${formatPrice(v.price)}` : formatPrice(v.price))).join(' · ')}</small>
            {showCategory && <small className="mn-in">{c.name}</small>}
          </div>
          <div className="mn-actions">
            <label className={`mn-switch${p.saving ? ' saving' : ''}`}>
              <input type="checkbox" role="switch" checked={p.isAvailable} disabled={p.saving} onChange={() => onToggle(p)} aria-label={`${p.name} disponible`} />
              <span className="mn-track" aria-hidden="true" />
              <span className="mn-state">{p.isAvailable ? 'Disponible' : 'Indisponible'}</span>
            </label>
            {isPatron && (
              <div className="mn-edit">
                {onMove && <Arrows label={p.name} upDisabled={i === 0} downDisabled={i === items.length - 1} onMove={(dir) => onMove(p, dir)} />}
                <Link className="mn-link" to={`/equipe/menu/plats/${p.id}`}>Modifier</Link>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Arrows({ label, upDisabled, downDisabled, onMove }) {
  return (
    <span className="mn-arrows">
      <button type="button" disabled={upDisabled} onClick={() => onMove(-1)} aria-label={`Monter ${label}`} title="Monter">↑</button>
      <button type="button" disabled={downDisabled} onClick={() => onMove(1)} aria-label={`Descendre ${label}`} title="Descendre">↓</button>
    </span>
  );
}
