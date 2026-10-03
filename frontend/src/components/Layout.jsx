import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import InstallBanner from './InstallBanner.jsx';

// Numéro provisoire, en attente du numéro définitif du client (voir CLAUDE.md)
export const WHATSAPP = '+226 70 00 00 01';
// Numéro marchand Orange Money / Moov Money, provisoire lui aussi
export const MERCHANT = '+226 70 00 00 00';

const TUNNEL = /^\/(commande|valider|confirmation)(\/|$)/;

// Partie du site, pour la couleur de fond de la page (voir styles.css)
function pageClass(pathname) {
  if (pathname.startsWith('/confirmation')) return 'p-confirmation';
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
            <Link className="brand" to="/" aria-label="Belchicken, accueil" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Brand subtitle="Commande en ligne" />
            </Link>
            <Link className="back" to="/menu">‹ Retour au menu</Link>
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
        <span><span className="dot"></span><b>Commandes ouvertes</b> · 11 h – 23 h</span>
        <span className="r hide-s">WhatsApp : <b>{WHATSAPP}</b></span>
      </div></div>

      <header className="top">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Belchicken, accueil" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Brand subtitle="Commande en ligne" />
          </Link>
          <nav className="nav" aria-label="Navigation principale">
            <NavLink to="/" end className={navClass}>Accueil</NavLink>
            <NavLink to="/menu" className={navClass}>Menu</NavLink>
            <NavLink to="/infos" className={navClass}>Infos pratiques</NavLink>
          </nav>
          <Link className="hbtn" to="/commande" style={{ textDecoration: 'none' }}>
            Ma commande <span className="n">{count}</span>
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
          <div><div className="brand"><Brand subtitle="Fresh fried chicken" /></div></div>
          <div><h4>Commander</h4><ul><li><Link to="/menu">Menu</Link></li><li><Link to="/commande">Ma commande</Link></li></ul></div>
          <div><h4>Aide</h4><ul><li><Link to="/infos">Livraison et paiement</Link></li><li><Link to="/infos">Horaires</Link></li></ul></div>
          <div><h4>Contact</h4><ul><li>WhatsApp : {WHATSAPP}</li><li>Adresse : à compléter</li></ul></div>
          <div className="legal"><span>© {new Date().getFullYear()} Belchicken</span><span>Prix en francs CFA</span></div>
        </div>
      </footer>
    </>
  );
}
