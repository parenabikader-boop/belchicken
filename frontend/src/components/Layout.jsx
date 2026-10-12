import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import InstallBanner from './InstallBanner.jsx';
import { DIRECTIONS_URL, openState, RESTAURANT, telHref, whatsappHref } from '../restaurant.js';
import { LangSwitch, useT } from '../i18n/index.jsx';

// Informations du restaurant : src/restaurant.js
export const WHATSAPP = RESTAURANT.whatsapp;

// « Commandes ouvertes » ou « Fermé », selon les horaires (mis à jour chaque minute)
function useOpenStatus() {
  const [status, setStatus] = useState(() => openState());
  useEffect(() => {
    const t = setInterval(() => setStatus(openState()), 60000);
    return () => clearInterval(t);
  }, []);
  return status;
}

const TUNNEL = /^\/(commande|valider|confirmation|suivi)(\/|$)/;

// Partie du site, pour la couleur de fond de la page (voir styles.css)
function pageClass(pathname) {
  if (/^\/(confirmation|suivi)\//.test(pathname)) return 'p-confirmation';
  if (TUNNEL.test(pathname)) return 'p-tunnel';
  if (pathname.startsWith('/menu')) return 'p-menu';
  if (pathname.startsWith('/infos')) return 'p-infos';
  return 'p-home';
}

function Brand({ subtitle }) {
  return (
    <>
      <span className="mark"><span>B</span></span>
      <span><b>Belchicken</b><small>{subtitle}</small></span>
    </>
  );
}

export default function Layout() {
  const { count } = useCart();
  const { pathname } = useLocation();
  const status = useOpenStatus();
  const t = useT();
  const L = t.layout;
  const statusText = typeof L.status[status.key] === 'function' ? L.status[status.key](status.hour) : L.status[status.key];

  // Lot 8 : titre de l'onglet dans la langue du site (en français, le même que dans index.html)
  useEffect(() => {
    document.title = L.docTitle;
  }, [L]);

  // Chaque page s'ouvre en haut, comme dans la maquette
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const navClass = ({ isActive }) => (isActive ? 'on' : undefined);

  // Tunnel de commande : en-tête réduit au logo et au retour au menu, sans pied de page
  if (TUNNEL.test(pathname)) {
    return (
      <>
        <header className="top tunnel">
          <div className="wrap">
            <Link className="brand" to="/" aria-label={L.homeAria} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Brand subtitle={L.subtitle} />
            </Link>
            <Link className="back" to="/menu">{L.backToMenu}</Link>
            <LangSwitch />
          </div>
        </header>
        <main className={pageClass(pathname)}>
          <Outlet />
        </main>
      </>
    );
  }

  return (
    <>
      <div className="util"><div className="wrap">
        <span className={status.open ? undefined : 'closed'}>
          <span className="dot"></span><b>{status.open ? L.open : L.closed}</b> · {statusText}
        </span>
        <span className="r hide-s">{L.whatsapp}<b>{WHATSAPP}</b></span>
        {/* Lot 8 : sur téléphone, le bouton FR / EN est ici (l'en-tête garde sa place) */}
        <LangSwitch className="in-util" />
      </div></div>

      <header className="top">
        <div className="wrap">
          <Link className="brand" to="/" aria-label={L.homeAria} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Brand subtitle={L.subtitle} />
          </Link>
          <nav className="nav" aria-label={L.navAria}>
            <NavLink to="/" end className={navClass}>{L.home}</NavLink>
            <NavLink to="/menu" className={navClass}>{L.menu}</NavLink>
            <NavLink to="/infos" className={navClass}>{L.infos}</NavLink>
          </nav>
          <LangSwitch />
          <Link className="hbtn" to="/commande" style={{ textDecoration: 'none' }}>
            {L.myOrder} <span className="n">{count}</span>
          </Link>
        </div>
      </header>

      {/* Hors du tunnel de commande, pour ne jamais gêner une commande en cours */}
      <div className="wrap"><InstallBanner app="client" /></div>

      <main className={pageClass(pathname)}>
        <Outlet />
      </main>

      <footer>
        <div className="wrap">
          <div><div className="brand"><Brand subtitle="Finest Fried Chicken & More" /></div></div>
          <div><h4>{L.footOrder}</h4><ul><li><Link to="/menu">{L.menu}</Link></li><li><Link to="/commande">{L.myOrder}</Link></li></ul></div>
          <div><h4>{L.footHelp}</h4><ul><li><Link to="/infos">{L.footDeliveryPayment}</Link></li><li><Link to="/infos">{L.footHours}</Link></li></ul></div>
          <div>
            <h4>{L.footContact}</h4>
            <ul>
              <li>{L.footRestaurant}<a href={telHref(RESTAURANT.phone)}>{RESTAURANT.phone}</a></li>
              <li>{L.footWhatsapp}<a href={whatsappHref(WHATSAPP)} target="_blank" rel="noreferrer">{WHATSAPP}</a></li>
              <li>{t.restaurant.address}, {RESTAURANT.city}</li>
              <li><a href={DIRECTIONS_URL} target="_blank" rel="noreferrer">{L.footMaps}</a></li>
            </ul>
          </div>
          <div className="legal"><span>© {new Date().getFullYear()} {RESTAURANT.name}</span><span>{L.footCfa}</span></div>
        </div>
      </footer>
    </>
  );
}
