import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleCheck, Clock, Heart, MessageCircle, ShoppingBag, Smartphone, Timer, TriangleAlert, Wallet } from 'lucide-react';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { useOrdersFeed } from '../orders/OrdersFeed.jsx';
import { useStaff } from '../StaffContext.jsx';
import { ChiffresTabs } from '../dashboard/ChiffresTabs.jsx';
import { DetailedDashboard } from '../dashboard/Dashboard.jsx';
import { compareState, isEarly, pctText } from '../dashboard/compare.js';
import { nowSummary } from '../dashboard/now.js';
import { avgDelivery, firstName, greeting } from './visual.js';
import '../dashboard/today.css';
import './theme.css';

// Nouveau visuel : tableau de bord du Patron. Mêmes chiffres que le tableau de bord actuel, sans aucun calcul de
// plus côté serveur : « Aujourd'hui » et les plats (GET /api/staff/dashboard/aujourdhui), le délai de livraison du
// jour (GET /api/staff/dashboard?period=day, livreurs), « À faire maintenant » depuis le fil des commandes déjà
// chargé (mêmes règles que le bloc « Maintenant », now.js). L'analyse détaillée reste repliée en dessous.
const REFRESH_MS = 60 * 1000;
const fDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fWeekday = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function usePolling(fetcher) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    const load = () => fetcher().then(
      (data) => alive && setState({ data, error: null }),
      (error) => alive && setState((s) => ({ data: s.data, error })),
    );
    load();
    const timer = setInterval(() => !document.hidden && load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// « ▲ +12 % par rapport à hier à la même heure » ; début de journée : « Trop tôt pour comparer »
function Compare({ d }) {
  const st = compareState({ now: d.today.revenue, before: d.yesterday.revenue, inProgress: true, basePaid: d.yesterday.paid });
  const lastWeek = `${fWeekday.format(new Date(d.lastWeekDay))} dernier`;
  const lw = compareState({ now: d.today.revenue, before: d.lastWeek.revenue, inProgress: true, basePaid: d.lastWeek.paid });
  const line = (s, label, base) => {
    if (s.kind === 'early' || isEarly({ inProgress: true, basePaid: base.paid })) return `Trop tôt pour comparer avec ${label} (${formatPrice(base.revenue)})`;
    if (s.kind === 'none') return `Rien ${label} à la même heure`;
    if (s.kind === 'flat') return `Comme ${label} à la même heure`;
    return `${s.pct > 0 ? '▲' : '▼'} ${pctText(s.pct)} par rapport à ${label} à la même heure`;
  };
  return (
    <div className="nvdb-cmp">
      <p>{line(st, 'hier', d.yesterday)}</p>
      <p>{line(lw, lastWeek, d.lastWeek)}</p>
    </div>
  );
}

function Tile({ to, tone, icon: Icon, value, label }) {
  return (
    <Link to={to} className="nv-card nvdb-tile">
      <span className={`nv-ico ${tone}`} aria-hidden="true"><Icon size={22} /></span>
      <b className="nvdb-tile-n">{value}</b>
      <span className="nvdb-tile-l">{label}</span>
    </Link>
  );
}

export default function NvDashboard() {
  const { user } = useStaff();
  const feed = useOrdersFeed();
  const today = usePolling(() => staffApi.getDashboardToday());
  const day = usePolling(() => staffApi.getDashboard('day', 0));
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const d = today.data;
  const n = nowSummary(feed.orders || [], feed.counts || {}, now);
  const delay = day.data ? avgDelivery(day.data.couriers) : null;
  const rows = d ? (week ? d.topWeek : d.topToday) : [];
  const max = Math.max(1, ...rows.map((p) => p.quantity));
  const date = new Date(d?.at || now);

  return (
    <div className="nvdb">
      <div className="nvdb-hello">
        <h1 className="nv-title">{greeting(date)}{firstName(user.name) ? `, ${firstName(user.name)}` : ''}</h1>
        <p className="nv-muted">{cap(fDate.format(date))}</p>
      </div>
      <ChiffresTabs />

      {/* Ventes du jour */}
      <section className="nvdb-hero" aria-labelledby="nvdb-sales">
        <h2 id="nvdb-sales">Ventes du jour</h2>
        {d ? (
          <>
            <p className="nvdb-hero-n">{formatPrice(d.today.revenue)}</p>
            <Compare d={d} />
            <div className="nvdb-minis">
              <div className="nvdb-mini"><ShoppingBag size={18} aria-hidden="true" /><b>{d.today.paid}</b><span>Commandes</span></div>
              <div className="nvdb-mini"><Wallet size={18} aria-hidden="true" /><b>{d.today.paid ? formatPrice(d.today.avgBasket) : '—'}</b><span>Panier moyen</span></div>
              <div className="nvdb-mini"><Timer size={18} aria-hidden="true" /><b>{delay != null ? `${delay} min` : '—'}</b><span>Délai de livraison</span></div>
            </div>
          </>
        ) : today.error ? <p role="alert">{today.error.message}</p> : <p>Chargement des chiffres…</p>}
        <p className="nvdb-hero-note">Plats des commandes payées, comparés à la même heure.</p>
      </section>

      {/* À faire maintenant : chaque tuile ouvre Commandes filtrée */}
      <section aria-labelledby="nvdb-todo">
        <div className="nv-sec-head">
          <h2 id="nvdb-todo">À faire maintenant</h2>
          <small>{feed.orders ? `${plural(n.inProgress, 'commande')} en cours` : 'Chargement…'}</small>
        </div>
        <div className="nvdb-tiles">
          <Tile to="/equipe/commandes?etape=PAIEMENT_A_VERIFIER" tone="orange" icon={Smartphone} value={n.toVerify} label={`Paiement${n.toVerify > 1 ? 's' : ''} à vérifier`} />
          <Tile to="/equipe/commandes?retard=1" tone="red" icon={TriangleAlert} value={n.late} label="En retard" />
          <Tile to="/equipe/commandes" tone="green" icon={MessageCircle} value={n.notice} label={`Message${n.notice > 1 ? 's' : ''} à confirmer`} />
          <Tile to="/equipe/commandes?etape=A_REMERCIER" tone="blue" icon={Heart} value={n.toThank} label="À remercier" />
        </div>
        {feed.orders && !n.late && !n.toVerify && !n.notice && !n.toThank && (
          <p className="nvdb-ok"><CircleCheck size={18} aria-hidden="true" /> Tout est à jour. Rien n’attend une action.</p>
        )}
      </section>

      {/* Plats du jour, en barres horizontales */}
      <section className="nv-card nvdb-top" aria-labelledby="nvdb-top">
        <div className="nv-sec-head">
          <h2 id="nvdb-top">Plats du jour</h2>
          <div className="nv-switch" role="group" aria-label="Période">
            <button type="button" className={week ? '' : 'on'} aria-pressed={!week} onClick={() => setWeek(false)}>Aujourd’hui</button>
            <button type="button" className={week ? 'on' : ''} aria-pressed={week} onClick={() => setWeek(true)}>7 jours</button>
          </div>
        </div>
        {!d ? <p className="nv-muted">Chargement…</p> : rows.length ? (
          <ol className="nvdb-bars">
            {rows.map((p) => (
              <li key={p.name}>
                <span className="nvdb-bar-l"><b>{p.name}</b><span>{p.quantity}</span></span>
                <span className="nvdb-bar" aria-hidden="true"><span style={{ width: `${(p.quantity / max) * 100}%` }} /></span>
              </li>
            ))}
          </ol>
        ) : <p className="nv-muted">{week ? 'Aucun plat vendu ces 7 jours.' : 'Aucun plat vendu aujourd’hui pour l’instant.'}</p>}
      </section>

      <details className="nv-card nvdb-more" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span><b>Analyse détaillée</b><small>Jour, semaine ou mois : chiffre par heure, plats et catégories, heures de pointe, paiements, livreurs, annulations.</small></span>
          <ChevronRight size={20} aria-hidden="true" />
        </summary>
        {open && <DetailedDashboard embedded />}
      </details>
      <p className="nv-muted nvdb-foot"><Clock size={14} aria-hidden="true" /> Mise à jour toutes les minutes.</p>
    </div>
  );
}
