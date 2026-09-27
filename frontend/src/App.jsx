import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import Commande from './pages/Commande.jsx';
import Placeholder from './pages/Placeholder.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="menu/:categorie?" element={<Menu />} />
        <Route path="commande" element={<Commande />} />
        <Route path="valider" element={<Placeholder title="Vos informations" />} />
        <Route path="confirmation/:reference" element={<Placeholder title="Confirmation" />} />
        <Route path="infos" element={<Placeholder title="Infos pratiques" />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
