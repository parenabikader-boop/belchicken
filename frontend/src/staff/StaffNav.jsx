import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { isPatronLevel, ROLE_LABEL, useStaff } from './StaffContext.jsx';
import { pageTitle, staffPages } from './nav-pages.js';
import './staff-nav.css';

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
);

// Barre de l'espace équipe, version simple (même chose sur téléphone, tablette et ordinateur) : logo, nom de la page,
// Alertes et « ⋮ », qui ouvre un panneau sur le côté avec toutes les pages du rôle (nav-pages.js), le nom de la
// personne connectée et Déconnexion. L'API vérifie toujours les droits : le panneau ne fait que cacher les liens.
export default function StaffNav({ unseen, chiffres }) {
  const { user, hasFeature } = useStaff();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  const prestataire = user.role === 'PRESTATAIRE';
  const pages = staffPages({ role: user.role, patron: isPatronLevel(user.role), hasFeature, chiffres });
  const title = pageTitle(pathname, pages);

  // Nouvelle page : le panneau se referme
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="st-top sn-top">
      <div className="st-wrap sn-bar">
        <Link to="/equipe/commandes" className="sn-logo" aria-label="Belchicken, Commandes">
          <span className="mark"><span>B</span></span>
        </Link>
        <div className="sn-title" aria-current="page">{title}</div>
        {/* Le Prestataire ne reçoit pas les alertes de commande (lot 4) */}
        {!prestataire && (
          <NavLink to="/equipe/alertes" className="sn-btn" aria-label="Alertes sur ce téléphone" title="Alertes sur ce téléphone">
            <BellIcon /><span className="sn-btn-txt">Alertes</span>
          </NavLink>
        )}
        <button type="button" ref={opener} className="sn-btn sn-more" aria-label="Toutes les pages" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span aria-hidden="true">⋮</span>
          {unseen > 0 && <span className="st-badge sn-dot" aria-label={`${unseen} nouvelles commandes`}>{unseen}</span>}
        </button>
      </div>
      {open && <NavPanel pages={pages} unseen={unseen} opener={opener} onClose={() => setOpen(false)} />}
    </header>
  );
}

// Panneau « ⋮ » : toutes les pages du rôle, la personne connectée et Déconnexion. Aussi ouvert par l'onglet « Plus »
// du nouveau visuel (nv/NvShell.jsx). Affiché = ouvert : Échap le referme, la page derrière ne défile plus, le
// premier lien reçoit le focus, puis le bouton qui l'a ouvert (opener) le retrouve à la fermeture.
export function NavPanel({ pages, unseen = 0, opener, onClose }) {
  const { user, logout } = useStaff();
  const { pathname } = useLocation();
  const panel = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('a, button')?.focus();
    const back = opener?.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      back?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
        <div className="sn-layer">
          <div className="sn-shade" onClick={onClose} aria-hidden="true" />
          <div className="sn-panel" ref={panel} role="dialog" aria-modal="true" aria-label="Pages de l’espace équipe">
            <div className="sn-panel-top">
              <span className="sn-panel-brand"><b>Belchicken</b><small>Espace équipe</small></span>
              <button type="button" className="sn-close" aria-label="Fermer" onClick={onClose}>×</button>
            </div>
            <nav className="sn-links" aria-label="Espace équipe">
              {pages.map((p) => (
                <NavLink key={p.to} to={p.to} className={() => (p.match.test(pathname) ? 'active' : undefined)}
                  aria-current={p.match.test(pathname) ? 'page' : undefined}>
                  <span>{p.label}</span>
                  {p.to === '/equipe/commandes' && unseen > 0 && <span className="st-badge" aria-label={`${unseen} nouvelles`}>{unseen}</span>}
                </NavLink>
              ))}
            </nav>
            <div className="sn-who">
              <NavLink to="/equipe/mot-de-passe" className="sn-name" title="Mon mot de passe">
                <b>{user.name}</b><small>{ROLE_LABEL[user.role]} · Mon mot de passe</small>
              </NavLink>
              <button type="button" className="sn-logout" onClick={logout}>Déconnexion</button>
            </div>
          </div>
        </div>
  );
}
