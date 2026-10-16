import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import SiteFrame from './components/SiteFrame.jsx';
import Home from './pages/Home.jsx';
import MenuChoice from './pages/MenuChoice.jsx';
// Lot « Commande simplifiée » : page actuelle (Commande, Valider) ou parcours court, selon l'interrupteur
import { CartPage, CheckoutPage } from './pages/SimpleChoice.jsx';
import Confirmation from './pages/Confirmation.jsx';
import Infos from './pages/Infos.jsx';
import { LanguageProvider } from './i18n/index.jsx';

// Espace équipe : fichier séparé, téléchargé seulement en allant sur /equipe
const StaffApp = lazy(() => import('./staff/StaffApp.jsx'));
// Lot 7 : page d'avis, petit fichier à part, sans l'en-tête ni le pied du site
const Review = lazy(() => import('./pages/Review.jsx'));

// Lot 11 : ancienne adresse d'essai du menu façon borne, renvoyée vers /menu (qui affiche le menu choisi par le Patron)
function OldKioskAddress() {
  const { categorie } = useParams();
  return <Navigate to={categorie ? `/menu/${categorie}` : '/menu'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="equipe/*" element={<Suspense fallback={null}><StaffApp /></Suspense>} />
      {/* Lot 8 : français ou anglais sur le site client seulement (l'espace équipe reste en français) */}
      <Route path="avis/:token" element={<LanguageProvider><Suspense fallback={null}><Review /></Suspense></LanguageProvider>} />
      <Route path="menu-borne/:categorie?" element={<OldKioskAddress />} />
      {/* Lot 11 : SiteFrame = Layout, sauf sur /menu avec « Menu façon borne » allumé (écran libre) */}
      <Route element={<LanguageProvider><SiteFrame /></LanguageProvider>}>
        <Route index element={<Home />} />
        <Route path="menu/:categorie?" element={<MenuChoice />} />
        <Route path="commande" element={<CartPage />} />
        <Route path="valider" element={<CheckoutPage />} />
        <Route path="confirmation/:reference" element={<Confirmation />} />
        {/* Même page, adresse courte envoyée au client sur WhatsApp */}
        <Route path="suivi/:reference" element={<Confirmation />} />
        <Route path="infos" element={<Infos />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
