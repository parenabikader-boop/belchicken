import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';
import StatementView, { dayLong } from './StatementView.jsx';
import { usePeriod } from './StatementPage.jsx';

// Lot 5d : relevé à imprimer ou à enregistrer en PDF (« Imprimer », puis « Enregistrer au format PDF »).
// Page seule, A4, sans l'en-tête de l'espace équipe. Même contenu que la page : le serveur retire les
// conditions et le montant dû pour le Responsable livraison.
export default function StatementPrint() {
  const { user } = useStaff();
  const { du, au } = usePeriod();
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState(null);
  // Patron : sa page Relevé ; Prestataire et Responsable livraison : l'onglet « Relevé » de la page Livraison
  const back = user.role === 'PATRON' ? `/equipe/releve?du=${du}&au=${au}` : `/equipe/livraison?onglet=releve&du=${du}&au=${au}`;

  useEffect(() => {
    staffApi.statement(du, au).then(setStatement, setError);
  }, [du, au]);

  // A4 et nom du fichier PDF proposé par le navigateur (titre de la page)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@page{size:A4;margin:12mm}';
    document.head.appendChild(style);
    const title = document.title;
    document.title = `Relevé de livraison du ${dayLong(du)} au ${dayLong(au)}`;
    return () => {
      style.remove();
      document.title = title;
    };
  }, [du, au]);

  return (
    <div className="slip-page rl-print">
      <div className="slip-bar">
        <Link className="st-back" to={back}>‹ Retour au relevé</Link>
        <button type="button" className="btn btn-p" onClick={() => window.print()} disabled={!statement}>Imprimer · PDF</button>
      </div>
      <p className="rl-print-help">Pour un PDF : « Imprimer », puis choisissez « Enregistrer au format PDF » comme imprimante.</p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!statement && !error && <p className="st-muted">Chargement du relevé…</p>}
      {statement && (
        <article className="rl-sheet">
          {statement.company.name && (
            <div className="rl-brand"><b>{statement.company.name}</b><span>Partenaire de livraison de {statement.company.client}</span></div>
          )}
          <StatementView s={statement} />
        </article>
      )}
    </div>
  );
}
