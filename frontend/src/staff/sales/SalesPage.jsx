import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { ChiffresTabs } from '../dashboard/ChiffresTabs.jsx';
import { todayKey } from '../statement/StatementPage.jsx';
import SalesView from './SalesView.jsx';

// Lot 6 : ventes de Belchicken par période (/equipe/ventes), Patron et Prestataire (l'API le vérifie).
// Onglet « Ventes » de la page Tableau de bord (l'en-tête du Patron est déjà plein).
// Adresse : ?du=AAAA-MM-JJ&au=AAAA-MM-JJ (par défaut : aujourd'hui).

const key = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

// Raccourcis en heure du Burkina (= UTC) ; la semaine commence le lundi
export function salesShortcuts(today = todayKey()) {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return [
    { id: 'jour', label: 'Aujourd’hui', du: today, au: today },
    { id: 'semaine', label: 'Cette semaine', du: key(y, m - 1, d - weekday), au: today },
    { id: 'mois', label: 'Ce mois', du: key(y, m - 1, 1), au: today },
    { id: 'dernier', label: 'Mois dernier', du: key(y, m - 2, 1), au: key(y, m - 1, 0) },
  ];
}

export function useSalesPeriod() {
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const du = params.get('du') || today;
  const au = params.get('au') || today;
  const setPeriod = (next) => setParams((p) => {
    const out = new URLSearchParams(p);
    out.set('du', next.du);
    out.set('au', next.au);
    return out;
  }, { replace: true });
  return { du, au, setPeriod };
}

export default function SalesPage() {
  const { du, au, setPeriod } = useSalesPeriod();
  const [form, setForm] = useState({ du, au });
  const [sales, setSales] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [excel, setExcel] = useState('');

  useEffect(() => setForm({ du, au }), [du, au]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    staffApi.sales(du, au).then(
      (s) => { if (live) { setSales(s); setError(''); setLoading(false); } },
      (e) => { if (live) { setError(e.message); setLoading(false); } },
    );
    return () => { live = false; };
  }, [du, au]);

  async function downloadExcel() {
    setExcel('busy');
    try {
      await staffApi.salesExcel(du, au);
      setExcel('');
    } catch (e) {
      setExcel(e.message);
    }
  }

  const today = todayKey();

  return (
    <div className="rl-page">
      <div className="st-head">
        <h1 className="st-title">Ventes</h1>
      </div>
      <ChiffresTabs />
      <p className="st-muted rl-lead">Chiffre d’affaires des plats, par provenance et par agent. Les commandes annulées et les frais de livraison sont toujours à part.</p>

      <section className="st-box rl-period" aria-label="Période">
        <div className="rl-shortcuts" role="group" aria-label="Raccourcis">
          {salesShortcuts(today).map((s) => (
            <button key={s.id} type="button" className={`od-tab${s.du === du && s.au === au ? ' on' : ''}`} aria-pressed={s.du === du && s.au === au} onClick={() => setPeriod(s)}>
              {s.label}
            </button>
          ))}
        </div>
        <form className="rl-dates" onSubmit={(e) => { e.preventDefault(); setPeriod(form); }}>
          <div className="f">
            <label htmlFor="sv-du">Du</label>
            <input id="sv-du" type="date" max={today} value={form.du} onChange={(e) => setForm({ ...form, du: e.target.value })} required />
          </div>
          <div className="f">
            <label htmlFor="sv-au">Au</label>
            <input id="sv-au" type="date" max={today} value={form.au} onChange={(e) => setForm({ ...form, au: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-s" disabled={form.du === du && form.au === au}>Afficher</button>
        </form>
        <div className="rl-exports">
          <Link className="btn btn-p" to={`/equipe/ventes/imprimer?du=${du}&au=${au}`} aria-disabled={!sales}>Imprimer · PDF</Link>
          <button type="button" className="btn btn-s" onClick={downloadExcel} disabled={!sales || excel === 'busy'}>
            {excel === 'busy' ? 'Préparation…' : 'Télécharger Excel'}
          </button>
        </div>
        {excel && excel !== 'busy' && <div className="alert err" role="alert"><span>{excel}</span></div>}
      </section>

      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
      {loading && !sales && <p className="st-muted">Chargement des ventes…</p>}
      {sales && (
        <div className={`st-box rl-box${loading ? ' rl-loading' : ''}`} aria-busy={loading}>
          <SalesView s={sales} />
        </div>
      )}
    </div>
  );
}
