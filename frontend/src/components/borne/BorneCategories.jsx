import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { photoBg, sizedPhoto } from '../../utils/visuals.js';
import { useT } from '../../i18n/index.jsx';

// Lot 11 : catégories toujours visibles. Colonne à gauche (tablette, ordinateur) ou bande qui glisse sous l'en-tête
// (téléphone), selon borne.css. Une seule catégorie affichée à la fois : la toucher ouvre /menu-borne/:categorie.
// La catégorie choisie reste en surbrillance (aucune pendant une recherche).
export default function BorneCategories({ categories, active, onPick }) {
  const t = useT();
  const nav = useRef(null);

  // Garde la catégorie choisie visible dans la colonne ou la bande, sans faire bouger la page
  useEffect(() => {
    const box = nav.current;
    const on = box?.querySelector('.on');
    if (!box || !on) return;
    const b = box.getBoundingClientRect();
    const o = on.getBoundingClientRect();
    if (box.scrollWidth > box.clientWidth) box.scrollLeft += o.left - b.left - (b.width - o.width) / 2;
    else box.scrollTop += o.top - b.top - (b.height - o.height) / 2;
  }, [active]);

  return (
    <nav className="kb-cats" ref={nav} aria-label={t.menu.categories}>
      {categories.map((c) => (
        <Link key={c.id} to={`/menu-borne/${c.slug}`} className={c.slug === active ? 'on' : undefined}
          aria-current={c.slug === active ? 'page' : undefined} onClick={onPick}>
          <span className="kb-cat-ph" style={{ background: photoBg(c.heroImageUrl) }}>
            {c.heroImageUrl && <img {...sizedPhoto(c.heroImageUrl, 'thumb')} alt="" loading="lazy" />}
          </span>
          <span className="kb-cat-name">{c.name}</span>
        </Link>
      ))}
    </nav>
  );
}
