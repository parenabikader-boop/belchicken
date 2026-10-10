import { useEffect } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { isPatronLevel, ROLE_LABEL, StaffProvider, useStaff } from './StaffContext.jsx';
import { RequireFeature } from './FeatureGate.jsx';
import { StaffScreen } from './StaffScreen.jsx';
import Login from './pages/Login.jsx';
import { OrdersFeedProvider, useOrdersFeed } from './orders/OrdersFeed.jsx';
import OrdersList from './orders/OrdersList.jsx';
import OrderDetail from './orders/OrderDetail.jsx';
import MenuAdmin from './menu/MenuAdmin.jsx';
import ProductForm from './menu/ProductForm.jsx';
import CategoryForm from './menu/CategoryForm.jsx';
import HomeAdmin from './home/HomeAdmin.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import AlertsPage from './alerts/AlertsPage.jsx';
import PasswordPage, { ForcedPassword } from './account/PasswordPage.jsx';
import TeamPage from './team/TeamPage.jsx';
import CoursesPage from './courier/CoursesPage.jsx';
import CashPage from './cash/CashPage.jsx';
import DeliveryFeesPage from './fees/DeliveryFeesPage.jsx';
import SettingsPage from './settings/SettingsPage.jsx';
import OrderSlip from './orders/OrderSlip.jsx';
import NewOrder from './orders/NewOrder.jsx';
import PrestatairePage from './prestataire/PrestatairePage.jsx';
import InstallBanner from '../components/InstallBanner.jsx';
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
          <Route path="*" element={<RoleRoutes />} />
        </Route>
      </Routes>
    </StaffProvider>
  );
}

// Le livreur a ses propres pages : toute autre adresse le ramène à ses courses (l'API refuse aussi)
function RoleRoutes() {
  const { user } = useStaff();
  return user.role === 'LIVREUR' ? <CourierRoutes /> : <TeamRoutes />;
}

function CourierRoutes() {
  return (
    <Routes>
      <Route element={<CourierShell />}>
        <Route path="courses" element={<CoursesPage />} />
        <Route path="alertes" element={<AlertsPage />} />
        <Route path="mot-de-passe" element={<PasswordPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/equipe/courses" replace />} />
    </Routes>
  );
}

function TeamRoutes() {
  return (
    <Routes>
      <Route element={<StaffLayout />}>
        <Route index element={<Navigate to="commandes" replace />} />
        <Route path="commandes" element={<OrdersList />} />
        <Route path="commandes/nouvelle" element={<NewOrder />} />
        <Route path="commandes/:reference" element={<OrderDetail />} />
        <Route path="menu" element={<MenuAdmin />} />
        <Route path="caisse" element={<RequireFeature feature="CAISSE"><CashPage /></RequireFeature>} />
        <Route path="alertes" element={<AlertsPage />} />
        <Route path="mot-de-passe" element={<PasswordPage />} />
        <Route element={<RequirePatron />}>
          <Route path="menu/plats/nouveau" element={<ProductForm />} />
          <Route path="menu/plats/:id" element={<ProductForm />} />
          <Route path="menu/categories/nouvelle" element={<CategoryForm />} />
          <Route path="menu/categories/:id" element={<CategoryForm />} />
          <Route path="accueil" element={<HomeAdmin />} />
          <Route path="tableau-de-bord" element={<RequireFeature feature="TABLEAU_DE_BORD"><Dashboard /></RequireFeature>} />
          <Route path="equipe" element={<TeamPage />} />
          <Route path="frais-livraison" element={<RequireFeature feature="FRAIS_LIVRAISON"><DeliveryFeesPage /></RequireFeature>} />
          <Route path="reglages" element={<RequireFeature feature="REGLAGES"><SettingsPage /></RequireFeature>} />
        </Route>
        <Route element={<RequirePrestataire />}>
          <Route path="prestataire" element={<PrestatairePage />} />
        </Route>
      </Route>
      {/* Bon de commande à imprimer : page seule, sans l'en-tête de l'espace équipe */}
      <Route path="commandes/:reference/bon" element={<OrderSlip />} />
      <Route path="*" element={<Navigate to="/equipe" replace />} />
    </Routes>
  );
}

// En-tête du livreur : ses courses, ses alertes, son mot de passe
function CourierShell() {
  const { user, logout } = useStaff();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="st-app">
      <header className="st-top">
        <div className="st-wrap">
          <Link to="/equipe/courses" className="st-brand" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="mark"><span>B</span></span><span><b>Belchicken</b><small>Espace livreur</small></span>
          </Link>
          <div className="st-user">
            <NavLink to="/equipe/mot-de-passe" className="st-name" title="Mon mot de passe">{user.name}<small>{ROLE_LABEL[user.role]}</small></NavLink>
            <NavLink to="/equipe/mot-de-passe" className="st-out st-bell st-sm-only" aria-label="Mon mot de passe">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            </NavLink>
            <NavLink to="/equipe/alertes" className="st-out st-bell" aria-label="Alertes sur ce téléphone">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </NavLink>
            <button type="button" className="st-out" onClick={logout}>Déconnexion</button>
          </div>
        </div>
      </header>
      <main className="st-wrap st-main">
        {pathname !== '/equipe/courses' && <Link className="st-back" to="/equipe/courses">‹ Mes courses</Link>}
        <InstallBanner app="equipe" />
        <Outlet />
      </main>
    </div>
  );
}

// Sans connexion, renvoie vers la page de connexion, en retenant la page demandée.
// Mot de passe provisoire : rien d'autre n'est affiché tant qu'il n'est pas remplacé (l'API bloque aussi).
function RequireStaff() {
  const { status, error, retry, user } = useStaff();
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
  if (user.mustChangePassword) return <StaffScreen><ForcedPassword /></StaffScreen>;
  return <Outlet />;
}

// Pages réservées au Patron (et au Prestataire, lot 4 ; l'API le vérifie aussi) : l'Opérateur revient à la liste du menu
function RequirePatron() {
  const { user } = useStaff();
  return isPatronLevel(user.role) ? <Outlet /> : <Navigate to="/equipe/menu" replace />;
}

// Page Prestataire (lot 4) : Prestataire seulement
function RequirePrestataire() {
  const { user } = useStaff();
  return user.role === 'PRESTATAIRE' ? <Outlet /> : <Navigate to="/equipe" replace />;
}

function StaffLayout() {
  return (
    <OrdersFeedProvider>
      <StaffShell />
    </OrdersFeedProvider>
  );
}

function StaffShell() {
  const { user, logout, hasFeature } = useStaff();
  const { unseen, soundReady } = useOrdersFeed();
  const patron = isPatronLevel(user.role);
  const prestataire = user.role === 'PRESTATAIRE';
  const { pathname } = useLocation();

  // Chaque page s'ouvre en haut
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="st-app">
      <header className="st-top">
        <div className="st-wrap">
          <Link to="/equipe/commandes" className="st-brand" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="mark"><span>B</span></span><span><b>Belchicken</b><small>Espace équipe</small></span>
          </Link>
          <nav className="st-nav" aria-label="Espace équipe">
            <NavLink to="/equipe/commandes">
              Commandes
              {unseen.size > 0 && <span className="st-badge" aria-label={`${unseen.size} nouvelles`}>{unseen.size}</span>}
            </NavLink>
            <NavLink to="/equipe/menu">Menu</NavLink>
            {hasFeature('CAISSE') && <NavLink to="/equipe/caisse">Caisse</NavLink>}
            {patron && hasFeature('FRAIS_LIVRAISON') && <NavLink to="/equipe/frais-livraison"><span className="st-lg">Frais de livraison</span><span className="st-sm">Frais</span></NavLink>}
            {patron && <NavLink to="/equipe/accueil">Accueil</NavLink>}
            {patron && hasFeature('TABLEAU_DE_BORD') && <NavLink to="/equipe/tableau-de-bord"><span className="st-lg">Tableau de bord</span><span className="st-sm">Chiffres</span></NavLink>}
            {patron && <NavLink to="/equipe/equipe">Équipe</NavLink>}
            {patron && hasFeature('REGLAGES') && <NavLink to="/equipe/reglages">Réglages</NavLink>}
            {prestataire && <NavLink to="/equipe/prestataire">Prestataire</NavLink>}
          </nav>
          <div className="st-user">
            <NavLink to="/equipe/mot-de-passe" className="st-name" title="Mon mot de passe">{user.name}<small>{ROLE_LABEL[user.role]}</small></NavLink>
            <NavLink to="/equipe/mot-de-passe" className="st-out st-bell st-sm-only" aria-label="Mon mot de passe">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            </NavLink>
            {/* Le Prestataire ne reçoit pas les alertes de commande (lot 4) */}
            {!prestataire && (
              <NavLink to="/equipe/alertes" className="st-out st-bell" aria-label="Alertes sur ce téléphone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                <span className="st-lg">Alertes</span>
              </NavLink>
            )}
            <button type="button" className="st-out" onClick={logout}>Déconnexion</button>
          </div>
        </div>
      </header>
      {!soundReady && <p className="st-sound">Touchez l'écran une fois pour activer le son des nouvelles commandes.</p>}
      <main className="st-wrap st-main">
        <InstallBanner app="equipe" />
        <Outlet />
      </main>
    </div>
  );
}
