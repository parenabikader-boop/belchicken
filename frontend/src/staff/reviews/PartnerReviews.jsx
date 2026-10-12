import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { todayKey } from '../statement/StatementPage.jsx';
import { salesShortcuts, useSalesPeriod } from '../sales/SalesPage.jsx';
import { periodText } from '../sales/SalesView.jsx';
import { plural } from '../../utils/format.js';
import { StarNote, when } from './ReviewsPage.jsx';

// Lot 7 : onglet « Avis » de la page Livraison (Responsable livraison et Prestataire). Seulement la note de
// livraison des commandes livrées par notre équipe : jamais les notes du call center ni du restaurant, ni les
// commentaires, ni le client (l'API ne les donne pas).
const avg = (n) => (n == null ? '—' : String(n).replace('.', ','));

export default function PartnerReviews() {
  const { du, au, setPeriod } = useSalesPeriod();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    staffApi.partnerReviews(du, au).then(
      (s) => { if (live) { setData(s); setError(''); } },
      (e) => { if (live) setError(e.message); },
    );
    return () => { live = false; };
  }, [du, au]);

  return (
    <div className="rl-page">
      <p className="od-hint">Notes de livraison données par les clients, pour les commandes livrées par notre équipe.</p>
      <div className="rl-shortcuts" role="group" aria-label="Période">
        {salesShortcuts(todayKey()).map((s) => (
          <button key={s.id} type="button" className={`od-tab${s.du === du && s.au === au ? ' on' : ''}`} aria-pressed={s.du === du && s.au === au} onClick={() => setPeriod(s)}>
            {s.label}
          </button>
        ))}
      </div>
      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
      {!data && !error && <p className="st-muted">Chargement…</p>}
      {data && (
        <div className="st-box rl-box">
          <div className="rl">
            <header className="rl-head">
              <span className="rl-kicker">Notes de livraison · notre équipe</span>
              <h2 className="rl-title">{periodText(data.period)}</h2>
            </header>
            <section className="rl-tiles" aria-label="En bref">
              <div className="rl-tile strong">
                <span className="rl-tile-label">Moyenne livraison</span>
                <b className="rl-tile-value">{data.count ? `${avg(data.average)} / 5` : '—'}</b>
                <small>{plural(data.count, 'note')}</small>
              </div>
              <div className="rl-tile">
                <span className="rl-tile-label">Mauvaises notes</span>
                <b className="rl-tile-value">{data.lowCount}</b>
                <small>2 étoiles ou moins</small>
              </div>
            </section>
            <section className="rl-sec">
              <h3>Par livreur</h3>
              {data.byCourier.length ? (
                <div className="rl-scroll">
                  <table className="rl-table">
                    <thead><tr><th>Livreur</th><th className="n">Notes</th><th className="n">Moyenne</th></tr></thead>
                    <tbody>{data.byCourier.map((c) => <tr key={c.key}><td>{c.name}</td><td className="n">{c.count}</td><td className="n"><b>{avg(c.average)}</b></td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="st-muted">Aucune note sur la période.</p>}
            </section>
            {data.list.length > 0 && (
              <section className="rl-sec">
                <h3>Toutes les notes</h3>
                <div className="rl-scroll">
                  <table className="rl-table">
                    <thead><tr><th>Date</th><th>Commande</th><th>Livreur</th><th>Note</th></tr></thead>
                    <tbody>{data.list.map((r) => <tr key={r.id}><td>{when(r.at)}</td><td>{r.reference}</td><td>{r.courierName || '—'}</td><td><StarNote n={r.delivery} /></td></tr>)}</tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
