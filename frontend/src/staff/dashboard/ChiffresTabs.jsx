import { NavLink } from 'react-router-dom';
import { useStaff } from '../StaffContext.jsx';

// Lot 6 : onglets « Tableau de bord » et « Ventes », chacun seulement si le Prestataire ne l'a pas fermé.
// Un seul lien dans l'en-tête du Patron (déjà plein sur tablette), les deux pages derrière ces onglets.
export function ChiffresTabs() {
  const { hasFeature } = useStaff();
  const tabs = [
    hasFeature('TABLEAU_DE_BORD') && { to: '/equipe/tableau-de-bord', label: 'Tableau de bord' },
    hasFeature('VENTES') && { to: '/equipe/ventes', label: 'Ventes' },
  ].filter(Boolean);
  if (tabs.length < 2) return null;
  return (
    <nav className="od-tabs ct-tabs" aria-label="Chiffres">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `od-tab${isActive ? ' on' : ''}`}>{t.label}</NavLink>
      ))}
    </nav>
  );
}

// Page d'arrivée du lien « Tableau de bord » de l'en-tête : le tableau de bord, sinon les ventes
export function chiffresHome(hasFeature) {
  if (hasFeature('TABLEAU_DE_BORD')) return '/equipe/tableau-de-bord';
  if (hasFeature('VENTES')) return '/equipe/ventes';
  return null;
}
