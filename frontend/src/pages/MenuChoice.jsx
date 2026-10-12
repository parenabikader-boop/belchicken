import { lazy, Suspense } from 'react';
import { useOutletContext } from 'react-router-dom';
import Menu from './Menu.jsx';

// Lot 11 : menu façon borne, fichier à part, téléchargé seulement quand le réglage est allumé
const MenuBorne = lazy(() => import('./MenuBorne.jsx'));

// /menu : le menu actuel (Menu.jsx, inchangé) ou, si le Patron a allumé « Menu façon borne » (et que le Prestataire
// l'inclut, interrupteur MENU_BORNE), le menu plein écran. Choix fait par components/SiteFrame.jsx.
export default function MenuChoice() {
  const kiosk = useOutletContext()?.kioskMenu === true;
  return kiosk ? <Suspense fallback={null}><MenuBorne /></Suspense> : <Menu />;
}
