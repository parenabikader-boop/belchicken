import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, Bike, ClipboardList, Ellipsis, FileText, House, LayoutDashboard, LogOut, MapPin, Settings, ShieldCheck, Users,
  UtensilsCrossed, Wallet,
} from 'lucide-react';
import { isPatronLevel, ROLE_LABEL, useStaff } from '../StaffContext.jsx';
import { pageTitle, staffPages } from '../nav-pages.js';
import { NavPanel } from '../StaffNav.jsx';
import InstallBanner from '../../components/InstallBanner.jsx';
import { bottomTabs, ownTabs } from './visual.js';
import './theme.css';

// Nouveau visuel (interrupteur NOUVEAU_VISUEL) : cadre de l'espace équipe. Mêmes pages et mêmes droits que la barre
// actuelle (staffPages, nav-pages.js) ; seule la présentation change :
//   - téléphone et tablette : barre du haut (nom de la page, Alertes) et barre d'onglets en bas, 4 au plus selon le
//     rôle ; le dernier, « Plus », ouvre le panneau ⋮ existant (NavPanel) ;
//   - ordinateur : la même navigation en menu à gauche.
// kind : 'team' (Patron, Opérateur, Prestataire), 'courier' (Livreur), 'delivery' (Responsable livraison).
const ICONS = {
  'Tableau de bord': LayoutDashboard,
  Commandes: ClipboardList,
  Menu: UtensilsCrossed,
  Caisse: Wallet,
  'Frais de livraison': MapPin,
  Équipe: Users,
  Réglages: Settings,
  'Accueil du site': House,
  Prestataire: ShieldCheck,
  Livraison: Bike,
  Relevé: FileText,
  Courses: Bike,
  Alertes: Bell,
  Plus: Ellipsis,
};
const Icon = ({ label, size = 22 }) => {
  const C = ICONS[label] || FileText;
  return <C size={size} strokeWidth={1.8} aria-hidden="true" />;
};

const OWN_TITLES = [
  [/^\/equipe\/courses/, 'Mes courses'],
  [/^\/equipe\/livraison/, 'Livraison'],
];

// Police Rubik, ajoutée une fois quand le nouveau visuel s'ouvre (le site client garde ses polices)
const RUBIK = 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap';
function useRubik() {
  useEffect(() => {
    if (document.querySelector(`link[href="${RUBIK}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = RUBIK;
    document.head.appendChild(link);
  }, []);
}

export default function NvShell({ kind = 'team', unseen = 0, chiffres = null, soundReady = true }) {
  const { user, logout, hasFeature } = useStaff();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  useRubik();
  const team = kind === 'team';
  const prestataire = user.role === 'PRESTATAIRE';
  // Panneau : toutes les pages du rôle (équipe) ; livreur et Responsable livraison : leurs pages
  const pages = team ? staffPages({ role: user.role, patron: isPatronLevel(user.role), hasFeature, chiffres }) : ownTabs(kind).filter((t) => !t.more);
  const tabs = team ? bottomTabs(user.role, pages) : ownTabs(kind);
  const title = team ? pageTitle(pathname, pages) : OWN_TITLES.find(([re]) => re.test(pathname))?.[1] || pageTitle(pathname, []);
  const alerts = kind !== 'delivery' && !prestataire; // le Prestataire ne reçoit pas les alertes (lot 4)
  const home = team ? '/equipe/commandes' : tabs[0].to;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const isOn = (t) => (t.match ? t.match.test(pathname) : pathname === t.to);
  const badge = (label) => label === 'Commandes' && unseen > 0 && <span className="nv-badge" aria-label={`${unseen} nouvelles`}>{unseen}</span>;

  return (
    <div className="nv">
      {/* Ordinateur : menu à gauche */}
      <aside className="nv-side" aria-label="Espace équipe">
        <Link to={home} className="nv-side-brand">
          <span className="nv-logo" aria-hidden="true">B</span>
          <span><b>Belchicken</b><small>{team ? 'Espace équipe' : kind === 'delivery' ? 'Équipe de livraison' : 'Espace livreur'}</small></span>
        </Link>
        <nav className="nv-side-links">
          {pages.map((p) => (
            <NavLink key={p.to} to={p.to} className={() => `nv-side-link${isOn(p) ? ' on' : ''}`} aria-current={isOn(p) ? 'page' : undefined}>
              <Icon label={p.label} />
              <span>{p.label}</span>
              {badge(p.label)}
            </NavLink>
          ))}
          {team && alerts && (
            <NavLink to="/equipe/alertes" className={({ isActive }) => `nv-side-link${isActive ? ' on' : ''}`}>
              <Icon label="Alertes" /><span>Alertes</span>
            </NavLink>
          )}
        </nav>
        <div className="nv-side-who">
          <NavLink to="/equipe/mot-de-passe" className="nv-side-name" title="Mon mot de passe">
            <b>{user.name}</b><small>{ROLE_LABEL[user.role]} · Mon mot de passe</small>
          </NavLink>
          <button type="button" className="nv-side-out" onClick={logout}><LogOut size={18} aria-hidden="true" /> Déconnexion</button>
        </div>
      </aside>

      {/* Téléphone et tablette : barre du haut */}
      <header className="nv-top">
        <Link to={home} className="nv-logo" aria-label="Belchicken">B</Link>
        <h2 className="nv-top-title" aria-current="page">{title}</h2>
        {alerts && (
          <NavLink to="/equipe/alertes" className="nv-icon-btn" aria-label="Alertes sur ce téléphone">
            <Bell size={22} strokeWidth={1.8} aria-hidden="true" />
          </NavLink>
        )}
      </header>

      {!soundReady && <p className="st-sound nv-sound">Touchez l'écran une fois pour activer le son des nouvelles commandes.</p>}
      <main className="nv-main">
        <InstallBanner app="equipe" />
        <Outlet />
      </main>

      <nav className="nv-tabs" aria-label="Onglets">
        {tabs.map((t) => (t.more ? (
          <button key="plus" type="button" ref={opener} className={`nv-tab${open ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon label="Plus" /><span>Plus</span>
            {team && unseen > 0 && !tabs.some((x) => x.label === 'Commandes') && <span className="nv-badge">{unseen}</span>}
          </button>
        ) : (
          <NavLink key={t.to} to={t.to} className={() => `nv-tab${isOn(t) ? ' on' : ''}`} aria-current={isOn(t) ? 'page' : undefined}>
            <Icon label={t.label} /><span>{t.label}</span>
            {badge(t.label)}
          </NavLink>
        )))}
      </nav>
      {open && <NavPanel pages={pages} unseen={unseen} opener={opener} onClose={() => setOpen(false)} />}
    </div>
  );
}
