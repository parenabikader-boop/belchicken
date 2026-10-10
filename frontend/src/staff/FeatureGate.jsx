import { useStaff } from './StaffContext.jsx';

// Lot 4 : même phrase que l'API (FONCTION_NON_INCLUSE, features.js)
export const FEATURE_CLOSED = 'Fonction non incluse dans votre formule, contactez votre prestataire.';

export function FeatureClosed({ title }) {
  return (
    <>
      {title && <div className="st-head"><h1 className="st-title">{title}</h1></div>}
      <div className="st-box st-closed" role="status">
        <b>{FEATURE_CLOSED}</b>
        <p className="st-muted">Rien n’est supprimé : tout revient dès que la fonction est rouverte.</p>
      </div>
    </>
  );
}

// Page d'une fonction que le Prestataire peut fermer. Ouverte directement par son adresse alors qu'elle
// est fermée : le message à la place de la page (l'API refuse aussi).
export function RequireFeature({ feature, children }) {
  const { hasFeature } = useStaff();
  return hasFeature(feature) ? children : <FeatureClosed />;
}
