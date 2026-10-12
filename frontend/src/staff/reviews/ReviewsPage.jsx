import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { ChiffresTabs } from '../dashboard/ChiffresTabs.jsx';
import { todayKey } from '../statement/StatementPage.jsx';
import { salesShortcuts, useSalesPeriod } from '../sales/SalesPage.jsx';
import { periodText } from '../sales/SalesView.jsx';
import { plural } from '../../utils/format.js';
import { formatPhone } from '../orders/labels.js';

// Lot 7 : avis des clients (/equipe/avis), Patron et Prestataire (l'API le vérifie). Onglet « Avis » de la page
// Tableau de bord. Moyennes de la période (date de l'avis), par agent (celui qui a vérifié le paiement) et par
// livreur, mauvais avis à rappeler (toutes dates), liste avec les commentaires.

const UTC = { timeZone: 'UTC' };
export const when = (iso) => new Date(iso).toLocaleString('fr-FR', { ...UTC, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const avg = (n) => (n == null ? '—' : String(n).replace('.', ','));
const TEAM = { RESTAURANT: 'Restaurant', PRESTATAIRE: 'Notre partenaire' };

// « ★★★★☆ » avec la note en clair pour les lecteurs d'écran ; rouge à 2 ou moins
export function StarNote({ n }) {
  if (n == null) return <span className="rv-n none">—</span>;
  return (
    <span className={`rv-n${n <= 2 ? ' low' : ''}`} aria-label={`${n} sur 5`}>
      <span aria-hidden="true">{'★'.repeat(n)}<i>{'★'.repeat(5 - n)}</i></span> {n}
    </span>
  );
}

const tel = (phone) => `tel:${phone}`;
const wa = (phone, reference) =>
  `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Bonjour, ici Belchicken Burkina. Merci pour votre avis sur la commande ${reference}.`)}`;

// Un mauvais avis à rappeler : le client, ses notes, son commentaire, et « Client rappelé »
function CallBack({ r, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function done() {
    setBusy(true);
    setError('');
    try {
      await staffApi.callBack(r.id, note.trim() || null);
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <li className="rv-call">
      <div className="rv-call-head">
        <b>{r.customerName}</b>
        <Link to={`/equipe/commandes/${r.reference}`}>{r.reference}</Link>
        <span className="st-muted">{when(r.at)}</span>
      </div>
      <Notes r={r} />
      {r.comment && <blockquote className="rv-quote">« {r.comment} »</blockquote>}
      <div className="rv-call-actions">
        <a className="btn btn-p" href={tel(r.customerPhone)}>Appeler {formatPhone(r.customerPhone)}</a>
        <a className="btn btn-s" href={wa(r.customerPhone, r.reference)} target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
      <div className="rv-call-done">
        <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note du rappel (facultatif) : ce qui a été dit, geste offert…" aria-label="Note du rappel" />
        <button type="button" className="btn btn-s" onClick={done} disabled={busy}>{busy ? 'Enregistrement…' : 'Client rappelé'}</button>
      </div>
      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
    </li>
  );
}

export function Notes({ r }) {
  return (
    <div className="rv-notes">
      <span>Call center <StarNote n={r.callCenter} />{r.agentName && <small> · {r.agentName}</small>}</span>
      <span>Restaurant <StarNote n={r.food} /></span>
      {r.mode !== 'A_EMPORTER' && <span>Livraison <StarNote n={r.delivery} />{r.courierName && <small> · {r.courierName}</small>}</span>}
    </div>
  );
}

function Tile({ label, value, note, strong }) {
  return (
    <div className={`rl-tile${strong ? ' strong' : ''}`}>
      <span className="rl-tile-label">{label}</span>
      <b className="rl-tile-value">{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

const outOf = (c) => (c.count ? `${avg(c.average)} / 5` : '—');

export default function ReviewsPage() {
  const { du, au, setPeriod } = useSalesPeriod();
  const [form, setForm] = useState({ du, au });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlyLow, setOnlyLow] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => setForm({ du, au }), [du, au]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    staffApi.reviews(du, au).then(
      (s) => { if (live) { setData(s); setError(''); setLoading(false); } },
      (e) => { if (live) { setError(e.message); setLoading(false); } },
    );
    return () => { live = false; };
  }, [du, au, tick]);

  const today = todayKey();
  const list = data ? data.list.filter((r) => !onlyLow || r.lowRating) : [];

  return (
    <div className="rl-page">
      <div className="st-head">
        <h1 className="st-title">Avis des clients</h1>
      </div>
      <ChiffresTabs />
      <p className="st-muted rl-lead">Notes de 1 à 5 données par les clients après la livraison ou le retrait. Un mauvais avis (2 étoiles ou moins) reste en haut tant que le client n’a pas été rappelé.</p>

      {data?.toCall.length > 0 && (
        <section className="st-box rv-tocall" aria-label="Clients à rappeler">
          <h2>À rappeler <span className="st-badge">{data.toCall.length}</span></h2>
          <ul>{data.toCall.map((r) => <CallBack key={r.id} r={r} onDone={() => setTick((t) => t + 1)} />)}</ul>
        </section>
      )}

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
            <label htmlFor="rv-du">Du</label>
            <input id="rv-du" type="date" max={today} value={form.du} onChange={(e) => setForm({ ...form, du: e.target.value })} required />
          </div>
          <div className="f">
            <label htmlFor="rv-au">Au</label>
            <input id="rv-au" type="date" max={today} value={form.au} onChange={(e) => setForm({ ...form, au: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-s" disabled={form.du === du && form.au === au}>Afficher</button>
        </form>
      </section>

      {error && <div className="alert err" role="alert"><span>{error}</span></div>}
      {loading && !data && <p className="st-muted">Chargement des avis…</p>}
      {data && (
        <div className={`st-box rl-box${loading ? ' rl-loading' : ''}`} aria-busy={loading}>
          <div className="rl">
            <header className="rl-head">
              <span className="rl-kicker">Avis des clients · Belchicken Burkina</span>
              <h2 className="rl-title">{periodText(data.period)}</h2>
              <p className="rl-sub">un avis compte le jour où le client l’a donné</p>
            </header>

            <section className="rl-tiles" aria-label="En bref">
              <Tile strong label="Avis reçus" value={data.count} note={data.lowCount ? `dont ${data.lowCount} mauvais avis` : 'aucun mauvais avis'} />
              <Tile label="Call center" value={outOf(data.criteria.callCenter)} note={plural(data.criteria.callCenter.count, 'note')} />
              <Tile label="Restaurant" value={outOf(data.criteria.food)} note={plural(data.criteria.food.count, 'note')} />
              <Tile label="Livraison" value={outOf(data.criteria.delivery)} note={`${plural(data.criteria.delivery.count, 'note')} (pas pour les commandes à emporter)`} />
            </section>

            <div className="sv-two">
              <section className="rl-sec">
                <h3>Call center, par agent</h3>
                <p className="st-muted rv-help">L’agent qui a vérifié le paiement de la commande.</p>
                {data.byAgent.length ? (
                  <div className="rl-scroll">
                    <table className="rl-table">
                      <thead><tr><th>Agent</th><th className="n">Avis</th><th className="n">Moyenne</th></tr></thead>
                      <tbody>{data.byAgent.map((a) => <tr key={a.key}><td>{a.name}</td><td className="n">{a.count}</td><td className="n"><b>{avg(a.average)}</b></td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <p className="st-muted">Aucun avis sur la période.</p>}
              </section>
              <section className="rl-sec">
                <h3>Livraison, par livreur</h3>
                <p className="st-muted rv-help">Le livreur qui a remis la commande.</p>
                {data.byCourier.length ? (
                  <div className="rl-scroll">
                    <table className="rl-table">
                      <thead><tr><th>Livreur</th><th>Équipe</th><th className="n">Avis</th><th className="n">Moyenne</th></tr></thead>
                      <tbody>{data.byCourier.map((c) => <tr key={c.key}><td>{c.name}</td><td>{TEAM[c.team]}</td><td className="n">{c.count}</td><td className="n"><b>{avg(c.average)}</b></td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <p className="st-muted">Aucune note de livraison sur la période.</p>}
              </section>
            </div>

            <section className="rl-sec">
              <div className="rv-list-head">
                <h3>Tous les avis ({data.list.length})</h3>
                <label className="rv-toggle"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Mauvais avis seulement</label>
              </div>
              {list.length ? (
                <ul className="rv-list">
                  {list.map((r) => (
                    <li key={r.id} className={r.lowRating ? 'low' : undefined}>
                      <div className="rv-call-head">
                        <Link to={`/equipe/commandes/${r.reference}`}>{r.reference}</Link>
                        <span>{r.customerName}</span>
                        {r.mode === 'A_EMPORTER' && <span className="st-muted">à emporter</span>}
                        <span className="st-muted">{when(r.at)}</span>
                      </div>
                      <Notes r={r} />
                      {r.comment && <blockquote className="rv-quote">« {r.comment} »</blockquote>}
                      {r.calledBack && <p className="rv-called">Client rappelé par {r.calledBack.by} le {when(r.calledBack.at)}{r.calledBack.note && <> : {r.calledBack.note}</>}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="st-muted">{onlyLow ? 'Aucun mauvais avis sur la période.' : 'Aucun avis sur la période.'}</p>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
