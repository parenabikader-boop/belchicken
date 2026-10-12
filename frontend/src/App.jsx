import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import Commande from './pages/Commande.jsx';
import Valider from './pages/Valider.jsx';
import Confirmation from './pages/Confirmation.jsx';
import Infos from './pages/Infos.jsx';
import { LanguageProvider } from './i18n/index.jsx';

// Espace équipe : fichier séparé, téléchargé seulement en allant sur /equipe
const StaffApp = lazy(() => import('./staff/StaffApp.jsx'));
// Lot 7 : page d'avis, petit fichier à part, sans l'en-tête ni le pied du site
const Review = lazy(() => import('./pages/Review.jsx'));
// Lot 11 : menu façon borne, adresse d'essai sans lien depuis le site (fichier à part, téléchargé seulement ici)
const MenuBorne = lazy(() => import('./pages/MenuBorne.jsx'));

export default function App() {
  return (
    <Routes>
      <Route path="equipe/*" element={<Suspense fallback={null}><StaffApp /></Suspense>} />
      {/* Lot 8 : français ou anglais sur le site client seulement (l'espace équipe reste en français) */}
      <Route path="avis/:token" element={<LanguageProvider><Suspense fallback={null}><Review /></Suspense></LanguageProvider>} />
      {/* Lot 11 : menu façon borne, écran libre (sa propre barre fine, sans l'en-tête ni le pied du site) */}
      <Route path="menu-borne/:categorie?" element={<LanguageProvider><Suspense fallback={null}><MenuBorne /></Suspense></LanguageProvider>} />
      <Route element={<LanguageProvider><Layout /></LanguageProvider>}>
        <Route index element={<Home />} />
        <Route path="menu/:categorie?" element={<Menu />} />
        <Route path="commande" element={<Commande />} />
        <Route path="valider" element={<Valider />} />
        <Route path="confirmation/:reference" element={<Confirmation />} />
        {/* Même page, adresse courte envoyée au client sur WhatsApp */}
        <Route path="suivi/:reference" element={<Confirmation />} />
        <Route path="infos" element={<Infos />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
