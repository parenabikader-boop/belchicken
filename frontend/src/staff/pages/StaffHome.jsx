import { ROLE_LABEL, useStaff } from '../StaffContext.jsx';

// Accueil de l'espace équipe : vide pour l'instant, les commandes arrivent à l'étape suivante
export default function StaffHome() {
  const { user } = useStaff();
  return (
    <>
      <h1 className="st-title">Bonjour {user.name.split(' ')[0]}</h1>
      <p className="st-muted">Connecté en tant que {ROLE_LABEL[user.role]}.</p>
      <div className="st-empty">
        <b>Les commandes arrivent bientôt ici.</b>
        <p>Cette page affichera les nouvelles commandes, leur détail et leur statut.</p>
      </div>
    </>
  );
}
