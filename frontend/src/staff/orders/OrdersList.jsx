import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { useOrdersFeed } from './OrdersFeed.jsx';
import AlertsPrompt from '../alerts/AlertsPrompt.jsx';
import { FEE_METHOD_LABEL, formatTime, HISTORY, HISTORY_FILTERS, METHOD_LABEL, STAGES, STATUS_LABEL, timeAgo } from './labels.js';

const REFRESH_MS = 5000;
// Au-delà : les 5 étapes en colonnes côte à côte ; en dessous : un onglet par étape
const WIDE = '(min-width: 1024px)';

// Page Commandes, une étape à la fois (onglets sur téléphone, colonnes sur ordinateur).
// Les étapes en cours viennent du fil partagé (OrdersFeed.jsx : son, badge, mise à jour toutes les 5 s).
// L'historique et la recherche ont leur propre requête, rafraîchie elle aussi toutes les 5 s.
// Adresse : ?etape=PAIEMENT_A_VERIFIER|PAYEE|EN_PREPARATION|EN_LIVRAISON|A_REMERCIER|HISTORIQUE, &statut=LIVREE|ANNULEE, &q=…
export default function OrdersList() {
  const feed = useOrdersFeed();
  const counts = feed.counts || {};
  const wide = useMediaQuery(WIDE);
  const [params, setParams] = useSearchParams();
  const etape = params.get('etape');
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);

  const go = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  // À l'ouverture : la première étape qui contient des commandes, en commençant par « À vérifier »
  useEffect(() => {
    if (etape || !feed.orders) return;
    const first = STAGES.find((s) => counts[s.id] > 0) || STAGES[0];
    go({ etape: first.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape, feed.orders]);

  // La recherche part 300 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) go({ q: search.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q]);

  const current = etape === HISTORY.id ? HISTORY : STAGES.find((s) => s.id === etape) || null;
  const historyCount = (counts.LIVREE || 0) + (counts.ANNULEE || 0);

  return (
    <>
      <div className="st-head">
        <h1 className="st-title">Commandes</h1>
        <span className="st-muted st-live"><span className="st-dot" />{feed.updatedAt ? 'Mise à jour automatique' : 'Chargement…'}</span>
      </div>

      <AlertsPrompt />

      <label className="st-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="Référence, nom ou téléphone" aria-label="Rechercher une commande" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {feed.error && <div className="alert err" role="alert" style={{ margin: '12px 0' }}><span>{feed.error.message} Nouvel essai automatique…</span></div>}

      {q ? (
        <SearchResults q={q} unseen={feed.unseen} onClear={() => setSearch('')} />
      ) : (
        <>
          <nav className="od-tabs" aria-label="Étapes">
            {(wide ? [] : STAGES).map((s) => (
              <StageTab key={s.id} stage={s} count={counts[s.id] || 0} on={current?.id === s.id} onClick={() => go({ etape: s.id, statut: null })} />
            ))}
            {wide && (
              <button type="button" className={`od-tab${current && current !== HISTORY ? ' on' : ''}`} aria-pressed={current !== HISTORY} onClick={() => go({ etape: STAGES[0].id, statut: null })}>
                Commandes en cours <span>{STAGES.reduce((n, s) => n + (counts[s.id] || 0), 0)}</span>
              </button>
            )}
            <button type="button" className={`od-tab od-tab-history${current === HISTORY ? ' on' : ''}`} aria-pressed={current === HISTORY} onClick={() => go({ etape: HISTORY.id })}>
              {HISTORY.label} <span>{historyCount}</span>
            </button>
          </nav>

          {!feed.orders && !feed.error ? (
            <p className="st-muted">Chargement des commandes…</p>
          ) : current === HISTORY ? (
            <History status={params.get('statut') || 'LIVREE'} counts={counts} onStatus={(s) => go({ statut: s })} />
          ) : wide ? (
            <Board feed={feed} />
          ) : current ? (
            <Stage stage={current} feed={feed} />
          ) : null}
        </>
      )}
    </>
  );
}

// Onglet d'une étape : mis en avant s'il contient des commandes, en jaune pour les paiements à vérifier.
// L'onglet choisi glisse dans la partie visible de la barre (les derniers sont cachés à droite sur téléphone).
function StageTab({ stage, count, on, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    const tab = ref.current;
    const bar = tab?.parentElement;
    if (!on || !bar) return;
    // Seulement dans la barre, sans faire bouger la page
    const t = tab.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (t.left < b.left || t.right > b.right) {
      bar.scrollTo({ left: bar.scrollLeft + t.left - b.left - (b.width - t.width) / 2, behavior: 'smooth' });
    }
  }, [on]);
  const cls = ['od-tab', on && 'on', count > 0 && 'has', count > 0 && stage.id === 'PAIEMENT_A_VERIFIER' && 'warn', count > 0 && stage.id === 'A_REMERCIER' && 'thanks'].filter(Boolean).join(' ');
  return (
    <button ref={ref} type="button" className={cls} aria-pressed={on} onClick={onClick}>
      {stage.label} <span>{count}</span>
    </button>
  );
}

// Commandes d'une étape : la plus ancienne en premier (celle qui attend depuis le plus longtemps)
const inStage = (o, id) => (id === 'A_REMERCIER' ? o.status === 'LIVREE' && o.toThank : o.status === id);
const ofStage = (orders, id) => (orders || []).filter((o) => inStage(o, id)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

// Téléphone : une seule étape
function Stage({ stage, feed }) {
  const orders = ofStage(feed.orders, stage.id);
  return (
    <section className={`od-stage s-${stage.id}`}>
      <p className="od-hint">{stage.hint}</p>
      <OrderList orders={orders} unseen={feed.unseen} empty={stage.empty} />
    </section>
  );
}

// Ordinateur : les 5 étapes côte à côte, comme un tableau de suivi
function Board({ feed }) {
  const counts = feed.counts || {};
  return (
    <div className="od-board">
      {STAGES.map((s) => {
        const n = counts[s.id] || 0;
        const orders = ofStage(feed.orders, s.id);
        return (
          <section key={s.id} className={`od-col s-${s.id}${n ? ' has' : ''}`} aria-label={s.label}>
            <header className="od-col-head">
              <h2>{s.label}</h2>
              <span className="od-count">{n}</span>
            </header>
            <p className="od-hint">{s.hint}</p>
            <OrderList orders={orders} unseen={feed.unseen} empty={s.empty} compact />
          </section>
        );
      })}
    </div>
  );
}

// Requête propre à l'historique ou à la recherche, rafraîchie toutes les 5 s
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
  return (
    <section className="od-stage">
      <p className="od-hint">{HISTORY.hint}</p>
      <nav className="st-chips od-sub" aria-label="Historique">
        {HISTORY_FILTERS.map((f) => (
          <button key={f.id} type="button" className={`st-chip${f.id === status ? ' on' : ''}`} aria-pressed={f.id === status} onClick={() => onStatus(f.id)}>
            {f.label} <span>{counts[f.id] || 0}</span>
          </button>
        ))}
      </nav>
      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error.message} Nouvel essai automatique…</span></div>}
      {orders ? <OrderList orders={orders} empty={status === 'LIVREE' ? 'Aucune commande livrée.' : 'Aucune commande annulée.'} withStatus /> : <p className="st-muted">Chargement…</p>}
    </section>
  );
}

// Recherche : dans toutes les commandes, quelle que soit l'étape
function SearchResults({ q, unseen, onClear }) {
  const { orders, error } = useOrders('TOUTES', q);
  return (
    <section className="od-stage od-results">
      <p className="od-hint">
        Résultats pour « {q} », toutes étapes confondues.{' '}
        <button type="button" className="st-text-btn" onClick={onClear}>Effacer la recherche</button>
      </p>
      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error.message} Nouvel essai automatique…</span></div>}
      {!orders ? (
        <p className="st-muted">Recherche…</p>
      ) : orders.length === 0 ? (
        <div className="st-empty">
          <b>Aucune commande pour « {q} »</b>
          <p>Essayez une référence (BC-…), un nom ou un numéro.</p>
        </div>
      ) : (
        <OrderList orders={orders} unseen={unseen} withStatus />
      )}
    </section>
  );
}

function OrderList({ orders, unseen, empty, compact = false, withStatus = false }) {
  if (orders.length === 0) return <p className="od-empty">{empty}</p>;
  return (
    <ul className={`st-orders${compact ? ' compact' : ''}`}>
      {orders.map((o) => <OrderCard key={o.reference} order={o} isNew={unseen?.has(o.reference)} withStatus={withStatus} />)}
    </ul>
  );
}

// Ce qui compte pour l'étape, sous le nom du client
function stageDetail(o) {
  if (o.status === 'PAYEE') return o.deliveryFee != null ? `Frais : ${formatPrice(o.deliveryFee)}, payés au livreur` : 'Frais à saisir';
  if (o.status === 'EN_LIVRAISON') return o.courierName ? `Livreur : ${o.courierName}` : 'Livreur non indiqué';
  if (o.status === 'LIVREE') return [o.courierName ? `Livrée par ${o.courierName}` : 'Livrée', o.deliveryFeeMethod && `frais ${FEE_METHOD_LABEL[o.deliveryFeeMethod]}`].filter(Boolean).join(' · ');
  return null;
}

function OrderCard({ order: o, isNew, withStatus }) {
  const verify = o.status === 'PAIEMENT_A_VERIFIER';
  const detail = !withStatus && stageDetail(o);
  return (
    <li>
      <Link to={`/equipe/commandes/${o.reference}`} className={`st-order s-${o.status}${verify ? ' verify' : ''}${o.toThank ? ' thank' : ''}`}>
        <div className="st-order-top">
          <b className="st-ref">{o.reference}</b>
          {isNew && <span className="st-new">Nouvelle</span>}
          <span className="st-time">{formatTime(o.createdAt)} · {timeAgo(o.createdAt)}</span>
        </div>
        <div className="st-order-name">{o.customerName}</div>
        {detail && <div className="od-detail">{detail}</div>}
        <div className="st-order-bottom">
          <span>{plural(o.itemCount, 'article')} · <b>{formatPrice(o.itemsTotal)}</b> · {METHOD_LABEL[o.paymentMethod]}</span>
          {withStatus && <span className={`st-pill p-${o.status}`}>{STATUS_LABEL[o.status]}</span>}
        </div>
      </Link>
    </li>
  );
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
