import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import Commande from './pages/Commande.jsx';
import Valider from './pages/Valider.jsx';
import Confirmation from './pages/Confirmation.jsx';
import Infos from './pages/Infos.jsx';

// Espace équipe : fichier séparé, téléchargé seulement en allant sur /equipe
const StaffApp = lazy(() => import('./staff/StaffApp.jsx'));

export default function App() {
  return (
    <Routes>
      <Route path="equipe/*" element={<Suspense fallback={null}><StaffApp /></Suspense>} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="menu/:categorie?" element={<Menu />} />
        <Route path="commande" element={<Commande />} />
        <Route path="valider" element={<Valider />} />
        <Route path="confirmation/:reference" element={<Confirmation />} />
        <Route path="infos" element={<Infos />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
