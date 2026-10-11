import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { dayLong } from '../statement/StatementView.jsx';
import SalesView from './SalesView.jsx';
import { useSalesPeriod } from './SalesPage.jsx';

// Lot 6 : ventes à imprimer ou à enregistrer en PDF (« Imprimer », puis « Enregistrer au format PDF »).
// Page seule, A4, sans l'en-tête de l'espace équipe, même contenu que la page Ventes.
export default function SalesPrint() {
  const { du, au } = useSalesPeriod();
  const [sales, setSales] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    staffApi.sales(du, au).then(setSales, setError);
  }, [du, au]);

  // A4 et nom du fichier PDF proposé par le navigateur (titre de la page)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@page{size:A4;margin:12mm}';
    document.head.appendChild(style);
    const title = document.title;
    document.title = du === au ? `Ventes du ${dayLong(du)}` : `Ventes du ${dayLong(du)} au ${dayLong(au)}`;
    return () => {
      style.remove();
      document.title = title;
    };
  }, [du, au]);

  return (
    <div className="slip-page rl-print">
      <div className="slip-bar">
        <Link className="st-back" to={`/equipe/ventes?du=${du}&au=${au}`}>‹ Retour aux ventes</Link>
        <button type="button" className="btn btn-p" onClick={() => window.print()} disabled={!sales}>Imprimer · PDF</button>
      </div>
      <p className="rl-print-help">Pour un PDF : « Imprimer », puis choisissez « Enregistrer au format PDF » comme imprimante.</p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!sales && !error && <p className="st-muted">Chargement des ventes…</p>}
      {sales && (
        <article className="rl-sheet">
          <SalesView s={sales} />
        </article>
      )}
    </div>
  );
}
