import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { useOrdersFeed } from '../orders/OrdersFeed.jsx';
import { useStaff } from '../StaffContext.jsx';
import AlertsPrompt from '../alerts/AlertsPrompt.jsx';
import { useAppSettings } from '../settings/useAppSettings.js';
import TourPanel from '../orders/TourPanel.jsx';
import { HISTORY, HISTORY_FILTERS, STAGES, STAGE_STATUSES, stageCount } from '../orders/labels.js';
import OrderCard2 from './OrderCard2.jsx';
import { boardColumns, byUrgency, byWait, nothingLine, shortLabel, summary, waitLevel } from './waiting.js';
import './orders2.css';

// Lot 12 : page Commandes plus lisible, sur /equipe/commandes quand le Patron allume « Nouvelle page Commandes »
// (StaffApp.jsx) ; toujours à /equipe/commandes-v2 pour le Patron et le Prestataire (lien dans Réglages).
// La page actuelle (orders/OrdersList.jsx) ne change pas. Même fil des commandes (OrdersFeed.jsx : son, badge,
// mise à jour toutes les 5 s), mêmes étapes (labels.js) ; en plus :
//   - explications repliées derrière « ? » (ouvertes au premier passage sur l'appareil) ;
//   - façon B (choisie par le client le 12 octobre 2026) : étapes vides cachées, résumées en une ligne « Rien à
//     vérifier, rien en préparation… » ; « Payées » cachée avec le parcours court quand elle est vide ;
//   - téléphone et tablette : onglet « Tout » (par défaut) = toutes les commandes triées par urgence, avec leur étape,
//     puis un onglet par étape qui a des commandes ;
//   - cartes compactes sur 2 lignes, couleur selon le temps passé à l'étape, plus longue attente en haut ;
//   - bandeau « en cours · en retard · à surveiller · messages » et filtre « En retard seulement ».
const WIDE = '(min-width: 1024px)';
const REFRESH_MS = 5000;
const HELP_SEEN = 'belchicken.commandes2.aide';

const inStage = (o, id) => (id === 'A_REMERCIER' ? o.status === 'LIVREE' && o.toThank : (STAGE_STATUSES[id] || [id]).includes(o.status));

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

// Explications : toutes ouvertes au premier passage sur cet appareil, repliées ensuite
function useHelp() {
  const [firstVisit] = useState(() => {
    try {
      const seen = localStorage.getItem(HELP_SEEN);
      localStorage.setItem(HELP_SEEN, '1');
      return !seen;
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(() => (firstVisit ? new Set(STAGES.map((s) => s.id)) : new Set()));
  const toggle = (id) => setOpen((x) => {
    const n = new Set(x);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return { isOpen: (id) => open.has(id), toggle };
}

export default function OrdersPage2() {
  const feed = useOrdersFeed();
  const counts = feed.counts || {};
  const wide = useMediaQuery(WIDE);
  const now = useNow();
  const help = useHelp();
  const { agentOrders, shortFlow } = useAppSettings();
  const [params, setParams] = useSearchParams();
  const etape = params.get('etape');
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);
  const [lateOnly, setLateOnly] = useState(false);

  const go = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) go({ q: search.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q]);

  const active = (feed.orders || []).filter((o) => STAGES.some((s) => inStage(o, s.id)));
  const sum = summary(active, now);
  const shown = (id) => active.filter((o) => inStage(o, id) && (!lateOnly || waitLevel(o, now) === 'late')).sort(byWait);
  const countOf = (id) => (lateOnly ? shown(id).length : stageCount(counts, id));
  const { visible, empty } = boardColumns(STAGES, countOf, { shortFlow });
  // En retard seulement : pas de ligne « Rien à… » (une étape peut avoir des commandes, mais aucune en retard)
  const nothing = lateOnly ? null : nothingLine(empty);
  const history = etape === HISTORY.id;
  // Téléphone et tablette : l'étape choisie si elle a des commandes, sinon « Tout »
  const tab = visible.find((c) => c.stage.id === etape) || null;
  const everything = active.filter((o) => !lateOnly || waitLevel(o, now) === 'late').sort(byUrgency(now));
  const stageOf = (o) => STAGES.find((st) => inStage(o, st.id));
  const noneText = lateOnly ? 'Aucune commande en retard.' : 'Aucune commande en cours.';

  return (
    <div className="o2">
      <div className="st-head o2-head">
        <h1 className="st-title">Commandes</h1>
        {agentOrders && <Link className="btn btn-p st-new-order" to="/equipe/commandes/nouvelle">+ Nouvelle commande</Link>}
        <span className="st-muted st-live"><span className="st-dot" />{feed.updatedAt ? 'Mise à jour automatique' : 'Chargement…'}</span>
      </div>

      <AlertsPrompt />

      <div className="o2-bar">
        <label className="st-search o2-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" placeholder="Référence, nom ou téléphone" aria-label="Rechercher une commande" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {!q && !history && (
          <div className="o2-sum" role="status">
            <span><b>{sum.total}</b> en cours</span>
            <button type="button" className={`o2-chip late${lateOnly ? ' on' : ''}`} aria-pressed={lateOnly} onClick={() => setLateOnly((x) => !x)} disabled={!sum.late && !lateOnly}
              title="Afficher seulement les commandes en retard">
              <b>{sum.late}</b> en retard{lateOnly ? ' · tout afficher' : ''}
            </button>
            <span className="o2-chip warn"><b>{sum.warn}</b> à surveiller</span>
            <span className="o2-chip msg"><b>{sum.notice}</b> message{sum.notice > 1 ? 's' : ''} à confirmer</span>
          </div>
        )}
        <div className="o2-views">
          <button type="button" className={`od-tab${!history ? ' on' : ''}`} aria-pressed={!history} onClick={() => go({ etape: null, q: null })}>En cours</button>
          <button type="button" className={`od-tab od-tab-history${history ? ' on' : ''}`} aria-pressed={history} onClick={() => go({ etape: HISTORY.id, q: null })}>
            {HISTORY.label} <span>{(counts.LIVREE || 0) + (counts.ANNULEE || 0)}</span>
          </button>
        </div>
      </div>

      {feed.error && <div className="alert err" role="alert" style={{ margin: '8px 0' }}><span>{feed.error.message} Nouvel essai automatique…</span></div>}

      {q ? (
        <Found q={q} unseen={feed.unseen} onClear={() => setSearch('')} />
      ) : history ? (
        <History status={params.get('statut') || 'LIVREE'} counts={counts} onStatus={(s) => go({ statut: s })} />
      ) : !feed.orders && !feed.error ? (
        <p className="st-muted">Chargement des commandes…</p>
      ) : (
        <>
          {nothing && <p className="o2-nothing">{nothing}</p>}
          {wide ? (
            <>
              <TourPanel orders={active.filter((o) => inStage(o, 'EN_PREPARATION'))} onDone={feed.refresh} />
              {visible.length ? (
                <div className="o2-board" style={{ gridTemplateColumns: visible.map(() => 'minmax(0,1fr)').join(' ') }}>
                  {visible.map(({ stage, count }) => (
                    <Column key={stage.id} stage={stage} count={count} orders={shown(stage.id)} unseen={feed.unseen} now={now} help={help} />
                  ))}
                </div>
              ) : (
                <p className="od-empty o2-none">{noneText}</p>
              )}
            </>
          ) : (
            <>
              <nav className="o2-tabs" aria-label="Étapes">
                <button type="button" className={`od-tab${!tab ? ' on' : ''}${everything.length ? ' has' : ''}${everything.some((o) => waitLevel(o, now) === 'late') ? ' late' : ''}`}
                  aria-pressed={!tab} onClick={() => go({ etape: null })}>
                  Tout <span>{everything.length}</span>
                </button>
                {visible.map(({ stage, count }) => {
                  const late = shown(stage.id).some((o) => waitLevel(o, now) === 'late');
                  return (
                    <button key={stage.id} type="button" className={`od-tab has${tab?.stage.id === stage.id ? ' on' : ''}${late ? ' late' : ''}`}
                      aria-pressed={tab?.stage.id === stage.id} onClick={() => go({ etape: stage.id })}>
                      {shortLabel(stage)} <span>{count}</span>
                    </button>
                  );
                })}
              </nav>
              {tab ? (
                <>
                  {tab.stage.id === 'EN_PREPARATION' && <TourPanel orders={active.filter((o) => inStage(o, 'EN_PREPARATION'))} onDone={feed.refresh} />}
                  <Column stage={tab.stage} count={tab.count} orders={shown(tab.stage.id)} unseen={feed.unseen} now={now} help={help} single />
                </>
              ) : everything.length ? (
                <ul className="o2-list">
                  {everything.map((o) => (
                    <OrderCard2 key={o.reference} order={o} isNew={feed.unseen?.has(o.reference)} now={now} stage={stageOf(o)} />
                  ))}
                </ul>
              ) : (
                <p className="od-empty o2-none">{noneText}</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// Une étape : en-tête (nom, nombre, « ? »), explication repliée, cartes compactes
function Column({ stage, count, orders, unseen, now, help, single = false }) {
  const open = help.isOpen(stage.id);
  return (
    <section className={`o2-col s-${stage.id}${count ? ' has' : ''}${single ? ' single' : ''}`} aria-label={stage.label}>
      <header className="o2-col-head">
        {!single && <h2>{stage.label}</h2>}
        <span className="od-count">{count}</span>
        <button type="button" className={`o2-help${open ? ' on' : ''}`} aria-expanded={open} onClick={() => help.toggle(stage.id)}
          aria-label={`Que faire à l’étape « ${stage.label} » ?`}>?</button>
      </header>
      {open && <p className="o2-hint">{stage.hint}</p>}
      {orders.length ? (
        <ul className="o2-list">{orders.map((o) => <OrderCard2 key={o.reference} order={o} isNew={unseen?.has(o.reference)} now={now} />)}</ul>
      ) : (
        <p className="od-empty">{stage.empty}</p>
      )}
    </section>
  );
}

// Historique et recherche : même requête que la page actuelle, rafraîchie toutes les 5 s
function useOrders(status, q) {
  const [state, setState] = useState({ orders: null, error: null });
  useEffect(() => {
    let alive = true;
    let timer;
    setState({ orders: null, error: null });
    const load = async () => {
      try {
        const data = await staffApi.orders({ status, q });
        if (alive) setState({ orders: data.orders, error: null });
      } catch (error) {
        if (alive) setState((s) => ({ orders: s.orders, error }));
      }
      if (alive) timer = setTimeout(load, REFRESH_MS);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [status, q]);
  return state;
}

function History({ status, counts, onStatus }) {
  const { orders, error } = useOrders(status, '');
  const full = useStaff().hasFeature('HISTORIQUE');
  return (
    <section className="o2-col single">
      {!full && <p className="o2-hint">Dernières 24 heures seulement : l’historique complet n’est pas inclus dans votre formule, contactez votre prestataire.</p>}
      <nav className="st-chips od-sub" aria-label="Historique">
        {HISTORY_FILTERS.map((f) => (
          <button key={f.id} type="button" className={`st-chip${f.id === status ? ' on' : ''}`} aria-pressed={f.id === status} onClick={() => onStatus(f.id)}>
            {f.label} <span>{counts[f.id] || 0}</span>
          </button>
        ))}
      </nav>
      {error && <div className="alert err" role="alert"><span>{error.message} Nouvel essai automatique…</span></div>}
      {!orders ? <p className="st-muted">Chargement…</p> : orders.length ? (
        <ul className="o2-list">{orders.map((o) => <OrderCard2 key={o.reference} order={o} withStatus />)}</ul>
      ) : <p className="od-empty">{status === 'LIVREE' ? 'Aucune commande livrée.' : 'Aucune commande annulée.'}</p>}
    </section>
  );
}

function Found({ q, unseen, onClear }) {
  const { orders, error } = useOrders('TOUTES', q);
  return (
    <section className="o2-col single">
      <p className="o2-hint">
        Résultats pour « {q} », toutes étapes confondues.{' '}
        <button type="button" className="st-text-btn" onClick={onClear}>Effacer la recherche</button>
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message} Nouvel essai automatique…</span></div>}
      {!orders ? <p className="st-muted">Recherche…</p> : orders.length ? (
        <ul className="o2-list">{orders.map((o) => <OrderCard2 key={o.reference} order={o} isNew={unseen?.has(o.reference)} withStatus />)}</ul>
      ) : (
        <div className="st-empty"><b>Aucune commande pour « {q} »</b><p>Essayez une référence (BC-…), un nom ou un numéro.</p></div>
      )}
    </section>
  );
}
