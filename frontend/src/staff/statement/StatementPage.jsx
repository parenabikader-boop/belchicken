import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';
import StatementView from './StatementView.jsx';

// Lot 5d : relevé de notre équipe de livraison (/equipe/releve ; onglet « Relevé » de la page Livraison).
// Prestataire : tout. Responsable livraison : sans conditions ni montant dû (le serveur ne les envoie pas).
// Patron : tout, en lecture seule, si le Prestataire a ouvert RELEVE.
// Adresse : ?du=AAAA-MM-JJ&au=AAAA-MM-JJ (par défaut : ce mois, jusqu'à aujourd'hui).

// Jours en heure du Burkina (= UTC)
export const todayKey = () => new Date().toISOString().slice(0, 10);
const key = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function shortcuts(today = todayKey()) {
  const [y, m, d] = today.split('-').map(Number);
  return [
    { id: 'mois', label: 'Ce mois', du: key(y, m - 1, 1), au: today },
    { id: 'dernier', label: 'Mois dernier', du: key(y, m - 2, 1), au: key(y, m - 1, 0) },
    { id: '7j', label: '7 derniers jours', du: key(y, m - 1, d - 6), au: today },
    { id: 'jour', label: 'Aujourd’hui', du: today, au: today },
  ];
}

export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const [first] = shortcuts();
  const du = params.get('du') || first.du;
  const au = params.get('au') || first.au;
  const setPeriod = (next) => setParams((p) => {
    const out = new URLSearchParams(p);
    out.set('du', next.du);
    out.set('au', next.au);
    return out;
  }, { replace: true });
  return { du, au, setPeriod };
}

export default function StatementPage({ embedded = false }) {
  const { user } = useStaff();
  const { du, au, setPeriod } = usePeriod();
  const [form, setForm] = useState({ du, au });
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [excel, setExcel] = useState('');

  useEffect(() => setForm({ du, au }), [du, au]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    staffApi.statement(du, au).then(
      (s) => { if (live) { setStatement(s); setError(''); setLoading(false); } },
      (e) => { if (live) { setError(e.message); setLoading(false); } },
    );
    return () => { live = false; };
  }, [du, au]);

  async function downloadExcel() {
    setExcel('busy');
    try {
      await staffApi.statementExcel(du, au);
      setExcel('');
    } catch (e) {
      setExcel(e.message);
    }
  }

  const today = todayKey();
  const readOnly = user.role === 'PATRON';
  const manager = user.role === 'RESPONSABLE_LIVRAISON';

  return (
    <div className="rl-page">
      {!embedded && (
        <div className="st-head">
          <h1 className="st-title">Relevé de livraison</h1>
          {readOnly && <span className="st-muted">Lecture seule</span>}
        </div>
      )}
      <p className="st-muted rl-lead">
        Le travail de notre équipe de livraison sur la période choisie
        {manager ? ' : livraisons, frais encaissés, délais, livreurs, tournées et annulations.' : ', et le montant dû par Belchicken selon les conditions du contrat.'}
      </p>

      <section className="st-box rl-period" aria-label="Période">
        <div className="rl-shortcuts" role="group" aria-label="Raccourcis">
          {shortcuts(today).map((s) => (
            <button key={s.id} type="button" className={`od-tab${s.du === du && s.au === au ? ' on' : ''}`} aria-pressed={s.du === du && s.au === au} onClick={() => setPeriod(s)}>
              {s.label}
            </button>
          ))}
        </div>
        <form className="rl-dates" onSubmit={(e) => { e.preventDefault(); setPeriod(form); }}>
          <div className="f">
            <label htmlFor="rl-du">Du</label>
            <input id="rl-du" type="date" max={today} value={form.du} onChange={(e) => setForm({ ...form, du: e.target.value })} required />
          </div>
          <div className="f">
            <label htmlFor="rl-au">Au</label>
            <input id="rl-au" type="date" max={today} value={form.au} onChange={(e) => setForm({ ...form, au: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-s" disabled={form.du === du && form.au === au}>Afficher</button>
        </form>
        <div className="rl-exports">
          <Link className="btn btn-p" to={`${manager ? '/equipe/livraison/releve' : '/equipe/releve'}/imprimer?du=${du}&au=${au}`} aria-disabled={!statement}>
            Imprimer · PDF
          </Link>
          <button type="button" className="btn btn-s" onClick={downloadExcel} disabled={!statement || excel === 'busy'}>
            {excel === 'busy' ? 'Préparation…' : 'Télécharger Excel'}
          </button>
        </div>
        {excel && excel !== 'busy' && <div className="alert err" role="alert"><span>{excel}</span></div>}
      </section>

      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
      {loading && !statement && <p className="st-muted">Chargement du relevé…</p>}
      {statement && (
        <div className={`st-box rl-box${loading ? ' rl-loading' : ''}`} aria-busy={loading}>
          <StatementView s={statement} />
        </div>
      )}
    </div>
  );
}
