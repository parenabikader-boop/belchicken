import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';

const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const GAP = 14;

// Largeur la plus petite d'une carte du menu, comme dans borne.css (téléphone, tablette, ordinateur)
const cardMin = () => (window.innerWidth < 700 ? Math.round(window.innerWidth * 0.44) : window.innerWidth <= 1024 ? 180 : 210);
// En dessous de ce nombre de plats, la rangée qui remplit la largeur pose ses cartes en largeur (photo à gauche),
// pour qu'un plat seul ne devienne pas une photo géante
const fewCols = () => (window.innerWidth < 700 ? 2 : 3);

// Lot 11 : une rangée d'articles. Si tous tiennent dans la largeur (fit), ils la remplissent en grille ;
// sinon la rangée glisse horizontalement (doigt, molette, clavier), calée sur chaque carte, avec flèches ‹ ›
// sur ordinateur. fit : seulement pour les rangées du menu (pas dans l'écran de personnalisation).
export default function BorneRow({ title, note, label, children, className = '', fit = false }) {
  const t = useT();
  const track = useRef(null);
  const count = Children.count(children);
  const [ends, setEnds] = useState({ start: true, end: true });
  const [cols, setCols] = useState(0); // 0 = la rangée glisse

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    if (fit) {
      const style = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setCols(count * cardMin() + (count - 1) * GAP <= inner ? count : 0);
    }
    setEnds({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, [fit, count]);

  useEffect(() => {
    measure();
    const el = track.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [measure, children]);

  const move = (dir) => {
    const el = track.current;
    el?.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: smooth() });
  };
  const scrolls = !cols;

  return (
    <div className={`kb-row ${className}`}>
      {title && (
        <div className="kb-row-h">
          <h3>{title}</h3>
          {note && <span>{note}</span>}
        </div>
      )}
      <div className="kb-row-in">
        <div className={`kb-track${cols ? ' fit' : ''}${cols && cols < fewCols() ? ' few' : ''}`} ref={track} onScroll={measure} style={cols ? { '--cols': cols } : undefined}
          tabIndex={scrolls ? 0 : undefined} role="group" aria-label={label || title}>
          {children}
        </div>
        {scrolls && !ends.start && (
          <button type="button" className="kb-arrow prev" onClick={() => move(-1)} aria-label={t.borne.prev} tabIndex={-1}>‹</button>
        )}
        {scrolls && !ends.end && (
          <button type="button" className="kb-arrow next" onClick={() => move(1)} aria-label={t.borne.next} tabIndex={-1}>›</button>
        )}
      </div>
    </div>
  );
}
