import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bike, ChevronRight, Clock, MessageCircle, Plus, Search, ShoppingBag } from 'lucide-react';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { useOrdersFeed } from '../orders/OrdersFeed.jsx';
import { useStaff } from '../StaffContext.jsx';
import AlertsPrompt from '../alerts/AlertsPrompt.jsx';
import { useAppSettings } from '../settings/useAppSettings.js';
import TourPanel from '../orders/TourPanel.jsx';
import { HISTORY, HISTORY_FILTERS, isPartner, isPickup, METHOD_LABEL, STAGES, STAGE_STATUSES, stageCount, statusLabel } from '../orders/labels.js';
import { stageDetail } from '../orders2/OrderCard2.jsx';
import { byUrgency, waitLevel, waitMinutes, waitText } from '../orders2/waiting.js';
import { cardAction, initials, tintOf, toneOf } from './visual.js';
import './theme.css';

// Nouveau visuel : page Commandes en cartes. Mêmes données et mêmes étapes que la page actuelle (fil des commandes
// OrdersFeed.jsx, étapes labels.js, seuils d'attente orders2/waiting.js). Les adresses ?etape=, ?retard=1 et ?q=
// sont les mêmes (liens du tableau de bord). Le bouton d'une carte ouvre la commande, où l'étape se fait comme avant.
const REFRESH_MS = 5000;
const PILL_LABEL = {
  PAIEMENT_A_VERIFIER: 'À vérifier',
  PAYEE: 'Payées',
  EN_PREPARATION: 'Cuisine',
  EN_LIVRAISON: 'En route',
  PRETE: 'À retirer',
  A_REMERCIER: 'À remercier',
};
const inStage = (o, id) => (id === 'A_REMERCIER' ? o.status === 'LIVREE' && o.toThank : (STAGE_STATUSES[id] || [id]).includes(o.status));

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function NvOrders() {
  const feed = useOrdersFeed();
  const counts = feed.counts || {};
  const now = useNow();
  const { agentOrders, shortFlow } = useAppSettings();
  const [params, setParams] = useSearchParams();
  const etape = params.get('etape');
  const q = params.get('q') || '';
  const late = params.get('retard') === '1';
  const [search, setSearch] = useState(q);

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
  const lateCount = active.filter((o) => waitLevel(o, now) === 'late').length;
  const history = etape === HISTORY.id;
  const stage = STAGES.find((s) => s.id === etape) || null;
  // Pastilles : Tout, En retard, puis chaque étape qui a des commandes (« Payées » cachée avec le parcours court quand vide)
  const pills = STAGES.map((s) => ({ s, n: stageCount(counts, s.id) })).filter(({ s, n }) => n > 0 || s.id === etape);
  const list = active
    .filter((o) => (!stage || inStage(o, stage.id)) && (!late || waitLevel(o, now) === 'late'))
    .sort(byUrgency(now));

  return (
    <div className="nvo">
      <div className="nv-head">
        <h1 className="nv-title">Commandes</h1>
        {agentOrders && <Link className="nv-btn nv-btn-p nv-btn-sm" to="/equipe/commandes/nouvelle"><Plus size={18} aria-hidden="true" /> Nouvelle</Link>}
      </div>
      <p className="nv-live"><span className="nv-live-dot" aria-hidden="true" />{feed.updatedAt ? `${plural(active.length, 'commande')} en cours · mise à jour automatique` : 'Chargement…'}</p>

      <AlertsPrompt />

      <label className="nv-search">
        <Search size={20} aria-hidden="true" />
        <input type="search" placeholder="Référence, nom ou téléphone" aria-label="Rechercher une commande" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {!q && (
        <nav className="nv-pills" aria-label="Filtrer les commandes">
          <button type="button" className={`nv-pill${!stage && !late && !history ? ' on' : ''}`} aria-pressed={!stage && !late && !history} onClick={() => go({ etape: null, retard: null })}>
            Tout <span>{active.length}</span>
          </button>
          {(lateCount > 0 || late) && (
            <button type="button" className={`nv-pill red${late ? ' on' : ''}`} aria-pressed={late} onClick={() => go({ retard: late ? null : '1', etape: null })}>
              En retard <span>{lateCount}</span>
            </button>
          )}
          {pills.map(({ s, n }) => (
            <button key={s.id} type="button" className={`nv-pill${stage?.id === s.id ? ' on' : ''}`} aria-pressed={stage?.id === s.id} onClick={() => go({ etape: s.id, retard: null })}>
              {PILL_LABEL[s.id] || s.label} <span>{n}</span>
            </button>
          ))}
          <button type="button" className={`nv-pill${history ? ' on' : ''}`} aria-pressed={history} onClick={() => go({ etape: HISTORY.id, retard: null })}>
            {HISTORY.label} <span>{(counts.LIVREE || 0) + (counts.ANNULEE || 0)}</span>
          </button>
        </nav>
      )}

      {feed.error && <div className="alert err" role="alert"><span>{feed.error.message} Nouvel essai automatique…</span></div>}

      {q ? (
        <Found q={q} unseen={feed.unseen} onClear={() => setSearch('')} />
      ) : history ? (
        <History status={params.get('statut') || 'LIVREE'} counts={counts} onStatus={(s) => go({ statut: s })} />
      ) : !feed.orders && !feed.error ? (
        <p className="nv-muted">Chargement des commandes…</p>
      ) : (
        <>
          {stage?.id === 'EN_PREPARATION' && <TourPanel orders={active.filter((o) => inStage(o, 'EN_PREPARATION'))} onDone={feed.refresh} />}
          {stage && <p className="nv-hint">{stage.hint}</p>}
          {list.length ? (
            <ul className="nv-cards">
              {list.map((o) => <OrderCard key={o.reference} o={o} now={now} isNew={feed.unseen?.has(o.reference)} shortFlow={shortFlow} />)}
            </ul>
          ) : (
            <div className="nv-empty">
              <b>{late ? 'Aucune commande en retard.' : stage ? stage.empty : 'Aucune commande en cours.'}</b>
              <p>Les nouvelles commandes arrivent ici toutes seules, avec un son.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Carte d'une commande : initiales, nom, référence et type, attente, articles, étape, montant, action suivante.
// withStatus : historique et recherche (étape sans temps d'attente).
function OrderCard({ o, now, isNew, shortFlow, withStatus = false }) {
  const level = withStatus ? null : waitLevel(o, now);
  const lateNow = level === 'late';
  const min = waitMinutes(o, now);
  const action = withStatus ? null : cardAction(o, { shortFlow });
  const pickup = isPickup(o);
  const type = pickup ? 'À récupérer' : `Livraison${o.deliveryZoneName ? ` · ${o.deliveryZoneName}` : ''}`;
  const detail = stageDetail(o)?.replace(/🛵\s?/u, ''); // pas d'emoji dans le nouveau visuel
  const label = o.status === 'LIVREE' && o.toThank && !withStatus ? 'À remercier' : statusLabel(o);
  return (
    <li className={`nv-card nv-order${lateNow ? ' late' : ''}${isNew ? ' new' : ''}`}>
      <Link to={`/equipe/commandes/${o.reference}`} className="nv-order-link" aria-label={`Commande ${o.reference}, ${o.customerName}`}>
        <span className={`nv-ini t${tintOf(o.customerName)}`} aria-hidden="true">{initials(o.customerName)}</span>
        <span className="nv-order-main">
          <span className="nv-order-l1">
            <b className="nv-order-name">{o.customerName}</b>
            {isNew && <span className="nv-tag new">Nouvelle</span>}
            {!withStatus && (
              <span className={`nv-wait w-${level}`}>
                <Clock size={14} aria-hidden="true" /> {waitText(min)}
              </span>
            )}
          </span>
          <span className="nv-order-l2">
            <span>{o.reference}</span>
            <span className="nv-type">{pickup ? <ShoppingBag size={14} aria-hidden="true" /> : <Bike size={14} aria-hidden="true" />} {type}</span>
          </span>
          <span className="nv-order-items">
            {plural(o.itemCount, 'article')} · {(METHOD_LABEL[o.paymentMethod] || '').trim()}{detail && !(pickup && /^À récupérer/.test(detail)) ? ` · ${detail}` : ''}
          </span>
          <span className="nv-order-l3">
            <span className={`nv-step ${toneOf(o)}`}>{label}</span>
            {lateNow && <span className="nv-step red">Retard {min} min</span>}
            {!withStatus && o.noticePending && o.status !== 'LIVREE' && <span className="nv-step green"><MessageCircle size={13} aria-hidden="true" /> Message</span>}
            {isPartner(o) && <span className="nv-tag">Prestataire</span>}
            <b className="nv-amount">{formatPrice(o.itemsTotal)}</b>
          </span>
        </span>
        {!action && <ChevronRight className="nv-chev" size={20} aria-hidden="true" />}
      </Link>
      {action && (
        <Link to={`/equipe/commandes/${o.reference}`} className={`nv-btn ${o.noticePending && o.status !== 'LIVREE' ? 'nv-btn-wa' : 'nv-btn-p'} nv-card-action`}>
          {action}
        </Link>
      )}
    </li>
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
    <section>
      {!full && <p className="nv-hint">Dernières 24 heures seulement : l’historique complet n’est pas inclus dans votre formule, contactez votre prestataire.</p>}
      <nav className="nv-pills sub" aria-label="Historique">
        {HISTORY_FILTERS.map((f) => (
          <button key={f.id} type="button" className={`nv-pill${f.id === status ? ' on' : ''}`} aria-pressed={f.id === status} onClick={() => onStatus(f.id)}>
            {f.label} <span>{counts[f.id] || 0}</span>
          </button>
        ))}
      </nav>
      {error && <div className="alert err" role="alert"><span>{error.message} Nouvel essai automatique…</span></div>}
      {!orders ? <p className="nv-muted">Chargement…</p> : orders.length ? (
        <ul className="nv-cards">{orders.map((o) => <OrderCard key={o.reference} o={o} withStatus />)}</ul>
      ) : <div className="nv-empty"><b>{status === 'LIVREE' ? 'Aucune commande livrée.' : 'Aucune commande annulée.'}</b></div>}
    </section>
  );
}

function Found({ q, unseen, onClear }) {
  const { orders, error } = useOrders('TOUTES', q);
  return (
    <section>
      <p className="nv-hint">
        Résultats pour « {q} », toutes étapes confondues.{' '}
        <button type="button" className="nv-link-btn" onClick={onClear}>Effacer la recherche</button>
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message} Nouvel essai automatique…</span></div>}
      {!orders ? <p className="nv-muted">Recherche…</p> : orders.length ? (
        <ul className="nv-cards">{orders.map((o) => <OrderCard key={o.reference} o={o} isNew={unseen?.has(o.reference)} withStatus />)}</ul>
      ) : (
        <div className="nv-empty"><b>Aucune commande pour « {q} »</b><p>Essayez une référence (BC-…), un nom ou un numéro.</p></div>
      )}
    </section>
  );
}
