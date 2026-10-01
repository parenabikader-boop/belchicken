import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ROLE_LABEL, StaffProvider, useStaff } from './StaffContext.jsx';
import { StaffScreen } from './StaffScreen.jsx';
import Login from './pages/Login.jsx';
import StaffHome from './pages/StaffHome.jsx';
import './staff.css';

// Espace équipe, sous /equipe. Chargé à part (voir App.jsx) : le code n'est jamais
// téléchargé par les clients du site, et aucune page publique n'y mène.
export default function StaffApp() {
  // Pages à ne jamais voir apparaître dans un moteur de recherche
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const title = document.title;
    document.title = 'Belchicken · Espace équipe';
    return () => {
      meta.remove();
      document.title = title;
    };
  }, []);

  return (
    <StaffProvider>
      <Routes>
        <Route path="connexion" element={<Login />} />
        <Route element={<RequireStaff />}>
          <Route element={<StaffLayout />}>
            <Route index element={<StaffHome />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/equipe" replace />} />
      </Routes>
    </StaffProvider>
  );
}

// Sans connexion, renvoie vers la page de connexion, en retenant la page demandée
function RequireStaff() {
  const { status, error, retry } = useStaff();
  const { pathname } = useLocation();
  if (status === 'loading') return <StaffScreen><p className="st-muted">Vérification de la connexion…</p></StaffScreen>;
  if (status === 'error') {
    return (
      <StaffScreen>
        <div className="alert err" role="alert"><span>{error.message}</span></div>
        <button type="button" className="btn btn-p" style={{ marginTop: 14 }} onClick={retry}>Réessayer</button>
      </StaffScreen>
    );
  }
  if (status === 'anon') return <Navigate to={`/equipe/connexion?suite=${encodeURIComponent(pathname)}`} replace />;
  return <Outlet />;
}

function StaffLayout() {
  const { user, logout } = useStaff();
  return (
    <div className="st-app">
      <header className="st-top">
        <div className="st-wrap">
          <div className="st-brand"><span className="mark"><span>B</span></span><span><b>Belchicken</b><small>Espace équipe</small></span></div>
          <div className="st-user">
            <span className="st-name">{user.name}<small>{ROLE_LABEL[user.role]}</small></span>
            <button type="button" className="st-out" onClick={logout}>Se déconnecter</button>
          </div>
        </div>
      </header>
      <main className="st-wrap st-main">
        <Outlet />
      </main>
    </div>
  );
}
