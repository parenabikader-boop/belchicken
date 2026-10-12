import { Outlet, useLocation } from 'react-router-dom';
import Layout from './Layout.jsx';
import { useKioskMenu } from '../utils/site.js';
import { isMenuPath } from '../utils/site-choice.js';

// Lot 11 : cadre des pages du site client. Sur /menu, réglage « Menu façon borne » allumé : écran libre, sans
// l'en-tête ni le pied du site (le menu façon borne a ses barres fines). Sinon : Layout, comme avant.
// Le choix est transmis à la page du menu (pages/MenuChoice.jsx), pour qu'en-tête et menu ne se contredisent jamais.
export default function SiteFrame() {
  const { pathname } = useLocation();
  const kiosk = useKioskMenu();
  if (!isMenuPath(pathname)) return <Layout />;
  if (kiosk === null) return null; // première visite : le temps de la réponse du serveur, sans clignotement
  return kiosk ? <Outlet context={{ kioskMenu: true }} /> : <Layout />;
}
