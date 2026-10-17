import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { accountsQuery, changeText, changeTone, hourWindow, PERIODS } from './patron-simple.js';
import './patron.css';

// Compte Patron simplifié : page « Comptes », page d'accueil du Patron. Gros chiffres, phrases calculées par le serveur,
// peu de texte. Chiffres : services/patron-accounts.js (ventes des repas seulement, jamais les frais de livraison).
const ClientsMap = lazy(() => import('./ClientsMap.jsx'));
const TZ = 'UTC'; // heure du Burkina
const fTime = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fDayTime = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fDay = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const SHORT_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const PAGE = 20;

function Change({ pct, upIsBad, show }) {
  if (!show || pct == null) return null;
  return <span className={`pc-chg ${changeTone(pct, upIsBad)}`}>{changeText(pct)}</span>;
}

// Colonnes simples : toucher une colonne affiche sa valeur au-dessus
function Bars({ bars, money }) {
  const best = bars.reduce((b, x, i) => (x.value > bars[b].value ? i : b), 0);
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const shown = bars[sel ?? best];
  if (!bars.some((b) => b.value)) return <p className="pc-none">Rien sur cette période.</p>;
  return (
    <div className="pc-bars-wrap">
      <p className="pc-read" aria-live="polite"><b>{shown.name}</b> · {money ? formatPrice(shown.value) : shown.value}{shown.detail ? ` · ${shown.detail}` : ''}</p>
      <div className="pc-bars" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b, i) => (
          <button key={b.key} type="button" className={i === (sel ?? best) ? 'on' : ''} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}
            aria-label={`${b.name} : ${money ? formatPrice(b.value) : b.value}`}>
            <span style={{ height: `${Math.max(b.value ? 4 : 0, (b.value / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="pc-axis" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bars.map((b, i) => <span key={b.key}>{bars.length > 12 && i % 2 ? '' : b.label}</span>)}
      </div>
    </div>
  );
}

function periodLabel(p) {
  if (p.kind === 'jour') return `Aujourd’hui, ${fDay.format(new Date(p.du))}`;
  if (p.kind === 'semaine') return 'Cette semaine (depuis lundi)';
  if (p.kind === 'mois') return 'Ce mois-ci';
  const f = (k) => k.split('-').reverse().join('/');
  return p.du === p.au ? `Le ${f(p.du)}` : `Du ${f(p.du)} au ${f(p.au)}`;
}

export default function ComptesPage() {
  const [params, setParams] = useSearchParams();
  const periode = PERIODS.some((p) => p.id === params.get('periode')) ? params.get('periode') : 'jour';
  const [du, setDu] = useState(params.get('du') || daysAgo(6));
  const [au, setAu] = useState(params.get('au') || today());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [excel, setExcel] = useState({ busy: false, error: null });
  const query = accountsQuery(periode, params.get('du') || du, params.get('au') || au);
  const key = JSON.stringify(query);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setShown(PAGE);
    staffApi.accounts(query).then(
      (d) => { if (alive) { setData(d); setLoading(false); } },
      (e) => { if (alive) { setError(e); setLoading(false); } },
    );
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id) => setParams(id === 'dates' ? { periode: id, du, au } : { periode: id }, { replace: true });
  const applyDates = (e) => {
    e.preventDefault();
    setParams({ periode: 'dates', du, au }, { replace: true });
  };
  const download = async () => {
    setExcel({ busy: true, error: null });
    try {
      await staffApi.accountsExcel(query, `comptes-${data.period.du}-au-${data.period.au}.xlsx`);
      setExcel({ busy: false, error: null });
    } catch (e) {
      setExcel({ busy: false, error: e.message });
    }
  };

  const s = data?.summary;
  const c = data?.changes;
  const cmp = data?.comparable;
  const long = data && (data.period.kind !== 'jour' && !(data.period.kind === 'dates' && data.period.du === data.period.au));

  return (
    <div className="pc">
      <h1 className="pt-sr">Comptes</h1>
      <div className="pc-periods" role="group" aria-label="Période">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={periode === p.id ? 'on' : ''} aria-pressed={periode === p.id} onClick={() => choose(p.id)}>{p.label}</button>
        ))}
      </div>
      {periode === 'dates' && (
        <form className="pc-dates" onSubmit={applyDates}>
          <label>Du <input type="date" value={du} max={today()} onChange={(e) => setDu(e.target.value)} required /></label>
          <label>au <input type="date" value={au} max={today()} onChange={(e) => setAu(e.target.value)} required /></label>
          <button type="submit" className="btn btn-p">Voir</button>
        </form>
      )}

      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!data && !error && <p className="st-muted">Chargement…</p>}

      {data && (
        <div className={loading ? 'pc-body loading' : 'pc-body'}>
          <p className="pc-when">{periodLabel(data.period)}</p>

          <section className="pc-hero">
            <h2>Ventes des repas</h2>
            <p className="pc-big">{formatPrice(s.revenue)}</p>
            {cmp
              ? <p className="pc-vs"><Change pct={c.revenue} show /> par rapport {data.period.compared}</p>
              : <p className="pc-vs muted">Trop tôt pour comparer</p>}
          </section>

          <div className="pc-tiles">
            <div className="pc-tile"><h3>Commandes payées</h3><p>{s.paid}</p><Change pct={c.paid} show={cmp} /></div>
            <div className="pc-tile"><h3>Panier moyen</h3><p>{s.paid ? formatPrice(s.avgBasket) : '—'}</p><Change pct={c.avgBasket} show={cmp && s.paid} /></div>
            <div className="pc-tile"><h3>Livraison</h3><p>{s.delivery.count}</p><small>{formatPrice(s.delivery.revenue)}</small></div>
            <div className="pc-tile"><h3>À récupérer</h3><p>{s.pickup.count}</p><small>{formatPrice(s.pickup.revenue)}</small></div>
            <div className={`pc-tile${s.cancelled.afterPayment.count ? ' warn' : ''}`}>
              <h3>Annulations</h3><p>{s.cancelled.count}</p>
              <small>
                {s.cancelled.afterPayment.count ? `${s.cancelled.afterPayment.count} après paiement (${formatPrice(s.cancelled.afterPayment.amount)})` : 'aucune après paiement'}
              </small>
            </div>
          </div>

          {data.insights.length > 0 && (
            <ul className="pc-insights">
              {data.insights.map((i) => <li key={i.key} className={i.tone}>{i.text}</li>)}
            </ul>
          )}

          {s.paid === 0 ? (
            <div className="st-empty"><b>Aucune vente sur cette période.</b></div>
          ) : (
            <>
              <section className="pc-card">
                <h2>Ventes par heure</h2>
                <Bars money bars={hourWindow(data.hours).map((h) => ({ key: h.hour, label: `${h.hour}h`, name: `${h.hour} h – ${(h.hour + 1) % 24} h`, value: h.revenue, detail: plural(h.count, 'commande') }))} />
              </section>
              {long && (
                <section className="pc-card">
                  <h2>Ventes par jour de la semaine</h2>
                  <p className="pc-note">Moyenne par jour</p>
                  <Bars money bars={data.days.map((d) => ({ key: d.day, label: SHORT_DAYS[d.day], name: d.name, value: d.avgRevenue, detail: plural(d.count, 'commande') }))} />
                </section>
              )}
              <section className="pc-card">
                <h2>Plats les plus vendus</h2>
                <ol className="pc-top">
                  {data.top.map((p) => (
                    <li key={p.name}>
                      <b>{p.name}</b><span>{p.quantity}</span>
                      <i style={{ width: `${(p.quantity / data.top[0].quantity) * 100}%` }} aria-hidden="true" />
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          <section className="pc-card">
            <h2>D’où viennent vos clients</h2>
            {data.zones.zones.length ? (
              <>
                <Suspense fallback={<div className="pc-map" />}><ClientsMap zones={data.zones.zones} /></Suspense>
                <p className="pc-note">
                  Zones d’environ 1 km, {data.zones.total} commande{data.zones.total > 1 ? 's livrées' : ' livrée'}
                  {data.zones.hidden > 0 ? ` (dont ${data.zones.hidden} dans des zones de moins de 3 commandes, non montrées)` : ''}.
                </p>
              </>
            ) : <p className="pc-none">Pas encore assez de livraisons sur cette période pour la carte (au moins 3 dans une même zone).</p>}
          </section>

          <section className="pc-card">
            <div className="pc-card-head">
              <h2>Transactions ({data.transactions.length})</h2>
              <button type="button" className="btn btn-s" onClick={download} disabled={excel.busy}>{excel.busy ? 'Préparation…' : 'Excel'}</button>
            </div>
            {excel.error && <p className="pc-err" role="alert">{excel.error}</p>}
            {data.transactions.length ? (
              <ul className="pc-tx">
                {data.transactions.slice(0, shown).map((t) => (
                  <li key={t.reference} className={t.cancelled ? 'cancelled' : undefined}>
                    <span className="pc-tx-time">{data.period.kind === 'jour' ? fTime.format(new Date(t.at)) : fDayTime.format(new Date(t.at))}</span>
                    <span className="pc-tx-main">
                      <b>{formatPrice(t.amount)}</b>
                      <small>{t.reference} · {t.method}{t.phone ? ` · ${t.phone}` : ''}</small>
                    </span>
                    <span className={`pc-tx-how${t.auto ? ' auto' : ''}`}>
                      {t.cancelled ? 'Annulée' : t.auto ? 'Automatique' : 'À la main'}
                      {!t.cancelled && !t.auto && t.by && <small>{t.by}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="pc-none">Aucune transaction sur cette période.</p>}
            {data.transactions.length > shown && (
              <button type="button" className="btn btn-s pc-more" onClick={() => setShown((n) => n + 50)}>Voir plus</button>
            )}
          </section>

          <p className="pc-foot">
            Ventes des repas seulement, sans les frais de livraison.
            {data.restaurantFees.count > 0 && ` Frais encaissés par vos livreurs : ${formatPrice(data.restaurantFees.amount)} (à part).`}
            {data.since && ` Comptes depuis le ${data.since.split('-').reverse().join('/')}.`}
          </p>
        </div>
      )}
    </div>
  );
}
