import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { useOrdersFeed } from '../orders/OrdersFeed.jsx';
import { useStaff } from '../StaffContext.jsx';
import { compareState, isEarly, pctText } from './compare.js';
import { allClear, nowSummary } from './now.js';

// Nouvelle présentation du tableau de bord (réglage « Nouvelle page Commandes et barre ⋮ ») : ce que le Patron doit
// comprendre d'un coup d'œil en arrivant. « Maintenant » vient du fil des commandes déjà chargé (aucune lecture de
// plus) ; « Aujourd'hui », les plats et la provenance viennent de GET /api/staff/dashboard/aujourdhui (léger).
// Heure du Burkina = UTC.
const REFRESH_MS = 60 * 1000;
const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts });
const fDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
const fWeekday = fmt({ weekday: 'long' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function useToday() {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    const load = () => staffApi.getDashboardToday().then(
      (data) => alive && setState({ data, error: null }),
      (error) => alive && setState((s) => ({ data: s.data, error })),
    );
    load();
    const timer = setInterval(() => !document.hidden && load(), REFRESH_MS);
    const onShow = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);
  return state;
}

// Une ligne « Maintenant » : cachée quand il n'y a rien
function Act({ to, tone, icon, children }) {
  return (
    <li>
      <Link to={to} className={`tb-act ${tone || ''}`}>
        <i aria-hidden="true">{icon}</i>
        <span>{children}</span>
        <em aria-hidden="true">›</em>
      </Link>
    </li>
  );
}

function NowBlock({ today }) {
  const feed = useOrdersFeed();
  const { hasFeature } = useStaff();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const n = nowSummary(feed.orders || [], feed.counts || {}, now);
  const reviewsToCall = today?.reviewsToCall || 0;
  const cash = hasFeature('CAISSE') ? today?.cashWithCouriers : null;
  const clear = allClear(n, { reviewsToCall, cash: cash?.amount || 0 });

  return (
    <section className="st-box tb-now" aria-labelledby="tb-now-t">
      <div className="tb-head">
        <h2 id="tb-now-t">Maintenant</h2>
        <small>{feed.orders ? plural(n.inProgress, 'commande') + ' en cours' : 'Chargement…'}</small>
      </div>
      {feed.orders && clear && <p className="tb-ok"><i aria-hidden="true">✓</i> Tout est à jour. Rien n’attend une action.</p>}
      {feed.orders && !clear && (
        <ul className="tb-acts">
          {n.late > 0 && <Act to="/equipe/commandes?retard=1" tone="late" icon="!"><b>{n.late}</b> en retard</Act>}
          {n.toVerify > 0 && <Act to="/equipe/commandes?etape=PAIEMENT_A_VERIFIER" tone="warn" icon="F"><b>{n.toVerify}</b> paiement{n.toVerify > 1 ? 's' : ''} à vérifier</Act>}
          {n.notice > 0 && <Act to="/equipe/commandes" tone="msg" icon="✉"><b>{n.notice}</b> message{n.notice > 1 ? 's' : ''} à confirmer</Act>}
          {n.toThank > 0 && <Act to="/equipe/commandes?etape=A_REMERCIER" icon="♥"><b>{n.toThank}</b> livrée{n.toThank > 1 ? 's' : ''} à remercier</Act>}
          {reviewsToCall > 0 && <Act to="/equipe/avis" tone="warn" icon="★"><b>{reviewsToCall}</b> avis à rappeler</Act>}
          {cash?.amount > 0 && (
            <Act to="/equipe/caisse?onglet=livreurs" icon="₣">
              <b>{formatPrice(cash.amount)}</b> chez les livreurs <small>({plural(cash.count, 'course')})</small>
            </Act>
          )}
        </ul>
      )}
    </section>
  );
}

// « ▲ +12 % hier (129 500 F) ». Début de journée (compare.js) : pas de ligne ici, une seule phrase grise sous les
// chiffres (TodayBlock), jamais de rouge.
function Cmp({ now, base, field, label, money }) {
  const st = compareState({ now, before: base[field], inProgress: true, basePaid: base.paid });
  const value = money ? formatPrice(base[field]) : base[field];
  if (st.kind === 'early') return null;
  if (st.kind === 'none') return <p className="tb-cmp flat">{label} : rien</p>;
  if (st.kind === 'flat') return <p className="tb-cmp flat">= {label} <span>({value})</span></p>;
  return (
    <p className={`tb-cmp ${st.kind}`}>
      <span aria-hidden="true">{st.pct > 0 ? '▲' : '▼'}</span> {pctText(st.pct)} <span className="tb-vs">{label} ({value})</span>
    </p>
  );
}

function Figure({ title, value, field, d, money, main }) {
  const lastWeek = `${fWeekday.format(new Date(d.lastWeekDay))} dernier`;
  return (
    <div className={`tb-fig${main ? ' main' : ''}`}>
      <h3>{title}</h3>
      <p className="tb-val">{value}</p>
      <Cmp now={d.today[field]} base={d.yesterday} field={field} label="hier" money={money} />
      <Cmp now={d.today[field]} base={d.lastWeek} field={field} label={lastWeek} money={money} />
    </div>
  );
}

function TodayBlock({ d, error }) {
  if (!d) {
    return (
      <section className="st-box tb-today">
        <div className="tb-head"><h2>Aujourd’hui</h2></div>
        {error ? <p className="alert err" role="alert">{error.message}</p> : <p className="st-muted">Chargement des chiffres…</p>}
      </section>
    );
  }
  const t = d.today;
  const at = new Date(d.at);
  const lastWeek = `${fWeekday.format(new Date(d.lastWeekDay))} dernier`;
  // Comparaisons trop maigres (début de journée) : une seule phrase
  const early = [['hier', d.yesterday], [lastWeek, d.lastWeek]]
    .filter(([, b]) => isEarly({ inProgress: true, basePaid: b.paid }))
    .map(([label, b]) => `${label} ${plural(b.paid, 'commande')} (${formatPrice(b.revenue)})`);
  return (
    <section className="st-box tb-today" aria-labelledby="tb-today-t">
      <div className="tb-head">
        <h2 id="tb-today-t">Aujourd’hui</h2>
        <small>{cap(fDay.format(at))}, à {fTime.format(at)}</small>
      </div>
      <div className="tb-figs">
        <Figure main title="Chiffre des plats" value={formatPrice(t.revenue)} field="revenue" d={d} money />
        <Figure title="Commandes payées" value={t.paid} field="paid" d={d} />
        <Figure title="Panier moyen" value={t.paid ? formatPrice(t.avgBasket) : '—'} field="avgBasket" d={d} money />
      </div>
      {early.length > 0 && <p className="tb-cmp flat tb-early">Trop tôt pour comparer : à la même heure, {early.join(', ')}.</p>}
      <p className="tb-note">Comparé à la même heure. Commandes payées seulement.</p>
      <p className="tb-fees">Frais de livraison encaissés : <b>{formatPrice(t.deliveryRevenue)}</b> · {plural(t.deliveryPaid, 'commande')}</p>
    </section>
  );
}

function TopBlock({ d }) {
  const [week, setWeek] = useState(false);
  if (!d) return null;
  const rows = week ? d.topWeek : d.topToday;
  const max = Math.max(1, ...rows.map((p) => p.quantity));
  return (
    <section className="st-box tb-top" aria-labelledby="tb-top-t">
      <div className="tb-head">
        <h2 id="tb-top-t">Plats les plus vendus</h2>
        <div className="tb-switch" role="group" aria-label="Période">
          <button type="button" className={week ? '' : 'on'} aria-pressed={!week} onClick={() => setWeek(false)}>Aujourd’hui</button>
          <button type="button" className={week ? 'on' : ''} aria-pressed={week} onClick={() => setWeek(true)}>7 jours</button>
        </div>
      </div>
      {rows.length ? (
        <ol className="tb-rank">
          {rows.map((p, i) => (
            <li key={p.name}>
              <span className="tb-rank-n">{i + 1}</span>
              <b>{p.name}</b>
              <span className="tb-rank-v">{p.quantity}</span>
              <span className="tb-track" aria-hidden="true"><span style={{ width: `${(p.quantity / max) * 100}%` }} /></span>
            </li>
          ))}
        </ol>
      ) : <p className="st-muted tb-none">{week ? 'Aucun plat vendu ces 7 jours.' : 'Aucun plat vendu aujourd’hui pour l’instant.'}</p>}
    </section>
  );
}

// Provenance du jour : cachée s'il n'y a que le site (serveur)
function SourcesBlock({ d }) {
  const { hasFeature } = useStaff();
  if (!d?.sources?.length) return null;
  const total = d.sources.reduce((s, r) => s + r.orders, 0);
  return (
    <section className="st-box tb-src" aria-labelledby="tb-src-t">
      <div className="tb-head">
        <h2 id="tb-src-t">Provenance aujourd’hui</h2>
        {d.salesOpen && hasFeature('VENTES') && <Link to="/equipe/ventes" className="tb-link">Ventes ›</Link>}
      </div>
      <div className="tb-split" aria-hidden="true">
        {d.sources.map((r, i) => <span key={r.name} className={`s${i % 4}`} style={{ flexGrow: r.orders }} />)}
      </div>
      <ul className="tb-legend">
        {d.sources.map((r, i) => (
          <li key={r.name}>
            <i className={`s${i % 4}`} aria-hidden="true" />
            <b>{r.name}</b>
            <span>{r.orders}</span>
            <small>{Math.round((r.orders / total) * 100)} % · {formatPrice(r.revenue)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TodayBlocks() {
  const { data, error } = useToday();
  return (
    <div className="tb">
      <div className="tb-row">
        <NowBlock today={data} />
        <TodayBlock d={data} error={error} />
      </div>
      <div className="tb-row">
        <TopBlock d={data} />
        <SourcesBlock d={data} />
      </div>
    </div>
  );
}
