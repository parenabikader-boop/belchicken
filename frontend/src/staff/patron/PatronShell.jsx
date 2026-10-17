import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStaff } from '../StaffContext.jsx';
import InstallBanner from '../../components/InstallBanner.jsx';
import { PATRON_APP, patronTabs } from './patron-simple.js';
import './patron.css';

const ICONS = {
  Comptes: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  Menu: <><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18" /><path d="M17 3c-2 2-3 5-3 8h3v10" /></>,
  Frais: <><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  Équipe: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 6" /></>,
  Avis: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
};
const Icon = ({ label }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[label]}</svg>
);

// Compte Patron simplifié : barre du haut (logo, nom de la page, « Mon compte ») et 5 onglets, en bas sur téléphone,
// sous la barre sur ordinateur. Pas d'alerte ni de son de nouvelle commande (les commandes sont gérées par le Prestataire).
export default function PatronShell() {
  const { user, hasFeature } = useStaff();
  const { pathname } = useLocation();
  const tabs = patronTabs(hasFeature);
  const current = tabs.find((t) => t.match.test(pathname));
  const title = current?.long || current?.label || (pathname.startsWith('/equipe/mon-compte') ? 'Mon compte' : 'Belchicken');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Lot B : application installable « BC Patron » (icône Belchicken, ouverte sur Comptes) à la place de « Belchicken
  // Équipe » tant que ce compte est affiché ; remis comme avant en quittant (déconnexion, interrupteur refermé)
  useEffect(() => {
    const swap = (id, attr, value) => {
      const el = document.getElementById(id);
      if (!el) return () => {};
      const old = el.getAttribute(attr);
      el.setAttribute(attr, value);
      return () => el.setAttribute(attr, old);
    };
    const undo = [
      swap('pwa-manifest', 'href', PATRON_APP.manifest),
      swap('pwa-apple-icon', 'href', PATRON_APP.appleIcon),
      swap('pwa-apple-title', 'content', PATRON_APP.appleTitle),
    ];
    return () => undo.forEach((f) => f());
  }, []);

  return (
    <div className="st-app pt-app">
      <header className="pt-top">
        <div className="pt-bar">
          <Link to="/equipe/comptes" className="pt-logo" aria-label="Belchicken, Comptes"><span className="mark"><span>B</span></span></Link>
          <b className="pt-title">{title}</b>
          <NavLink to="/equipe/mon-compte" className="pt-me" aria-label="Mon compte">
            <span>{user.name.trim().charAt(0).toUpperCase()}</span>
          </NavLink>
        </div>
        <nav className="pt-tabs" aria-label="Compte Patron">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={() => (t.match.test(pathname) ? 'on' : undefined)} aria-current={t.match.test(pathname) ? 'page' : undefined}>
              <Icon label={t.label} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="st-wrap st-main pt-main">
        <InstallBanner app="patron" />
        <Outlet />
      </main>
    </div>
  );
}
