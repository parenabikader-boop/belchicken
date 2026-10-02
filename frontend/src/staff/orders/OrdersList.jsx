import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { useOrdersFeed } from './OrdersFeed.jsx';
import { ACTIVE, FILTERS, formatTime, METHOD_LABEL, STATUS_LABEL, timeAgo } from './labels.js';

const REFRESH_MS = 5000;

// Liste des commandes. Vue par défaut (« En cours », sans recherche) : les données du fil partagé.
// Autre filtre ou recherche : requête dédiée, rafraîchie elle aussi toutes les 5 s.
export default function OrdersList() {
  const feed = useOrdersFeed();
  const [params, setParams] = useSearchParams();
  const status = params.get('statut') || 'EN_COURS';
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);
  const [own, setOwn] = useState(null); // { orders, error } pour un filtre ou une recherche
  const usesFeed = status === 'EN_COURS' && !q;

  // La recherche part 300 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() === q) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set('q', search.trim());
      else next.delete('q');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, params, setParams]);

  useEffect(() => {
    if (usesFeed) return undefined;
    let alive = true;
    let timer;
    setOwn(null);
    const load = async () => {
      try {
        const data = await staffApi.orders({ status, q });
        if (alive) setOwn({ orders: data.orders, error: null });
      } catch (error) {
        if (alive) setOwn((o) => ({ orders: o?.orders || null, error }));
      }
      if (alive) timer = setTimeout(load, REFRESH_MS);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [usesFeed, status, q]);

  const setStatus = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'EN_COURS') next.delete('statut');
    else next.set('statut', id);
    setParams(next, { replace: true });
  };

  const counts = feed.counts || {};
  const countFor = (id) => {
    if (id === 'EN_COURS') return ACTIVE.reduce((n, s) => n + (counts[s] || 0), 0);
    if (id === 'TOUTES') return null;
    return counts[id] || 0;
  };
  const toVerify = counts.PAIEMENT_A_VERIFIER || 0;
  const orders = usesFeed ? feed.orders : own?.orders;
  const error = usesFeed ? feed.error : own?.error;

  return (
    <>
      <div className="st-head">
        <h1 className="st-title">Commandes</h1>
        <span className="st-muted st-live"><span className="st-dot" />{feed.updatedAt ? 'Mise à jour automatique' : 'Chargement…'}</span>
      </div>

      {toVerify > 0 && status !== 'PAIEMENT_A_VERIFIER' && (
        <button type="button" className="st-verify" onClick={() => setStatus('PAIEMENT_A_VERIFIER')}>
          <b>{toVerify}</b> {toVerify > 1 ? 'paiements à vérifier' : 'paiement à vérifier'}
          <span>Voir ›</span>
        </button>
      )}

      <label className="st-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="Référence, nom ou téléphone" aria-label="Rechercher une commande" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      <nav className="st-chips" aria-label="Filtrer par statut">
        {FILTERS.map((f) => {
          const n = countFor(f.id);
          return (
            <button key={f.id} type="button" className={`st-chip${f.id === status ? ' on' : ''}${f.id === 'PAIEMENT_A_VERIFIER' && n ? ' warn' : ''}`} aria-pressed={f.id === status} onClick={() => setStatus(f.id)}>
              {f.label}{n != null && <span>{n}</span>}
            </button>
          );
        })}
      </nav>

      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error.message} Nouvel essai automatique…</span></div>}

      {!orders ? (
        <p className="st-muted">Chargement des commandes…</p>
      ) : orders.length === 0 ? (
        <div className="st-empty">
          <b>{q ? `Aucune commande pour « ${q} »` : 'Aucune commande ici'}</b>
          <p>{q ? 'Essayez une référence (BC-…), un nom ou un numéro.' : 'Les nouvelles commandes apparaissent toutes seules, avec un son.'}</p>
        </div>
      ) : (
        <ul className="st-orders">
          {orders.map((o) => <OrderCard key={o.reference} order={o} isNew={feed.unseen.has(o.reference)} />)}
        </ul>
      )}
    </>
  );
}

function OrderCard({ order: o, isNew }) {
  const verify = o.status === 'PAIEMENT_A_VERIFIER';
  return (
    <li>
      <Link to={`/equipe/commandes/${o.reference}`} className={`st-order s-${o.status}${verify ? ' verify' : ''}`}>
        <div className="st-order-top">
          <b className="st-ref">{o.reference}</b>
          {isNew && <span className="st-new">Nouvelle</span>}
          <span className="st-time">{formatTime(o.createdAt)} · {timeAgo(o.createdAt)}</span>
        </div>
        <div className="st-order-name">{o.customerName}</div>
        <div className="st-order-bottom">
          <span>{plural(o.itemCount, 'article')} · <b>{formatPrice(o.itemsTotal)}</b> · {METHOD_LABEL[o.paymentMethod]}</span>
          <span className={`st-pill p-${o.status}`}>{STATUS_LABEL[o.status]}</span>
        </div>
      </Link>
    </li>
  );
}
