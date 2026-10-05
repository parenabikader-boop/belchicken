import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import { useOrdersFeed } from './OrdersFeed.jsx';
import { formatDateTime, formatPhone, mapsHref, METHOD_LABEL, STATUS_LABEL, telHref, timeAgo, timelineOf, whatsappHref } from './labels.js';
import { Actions, DeliveryFee, Notice, useSteps } from './OrderSteps.jsx';

const REFRESH_MS = 5000;

export default function OrderDetail() {
  const { reference } = useParams();
  const feed = useOrdersFeed();
  const { markSeen, refresh: refreshFeed } = feed;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setOrder(await staffApi.order(reference));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [reference]);

  // Ouverte = vue : la commande n'est plus « nouvelle ». Rafraîchie toutes les 5 s (changements d'un collègue).
  useEffect(() => {
    markSeen(reference.toUpperCase());
    load();
    const t = setInterval(() => !document.hidden && load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [reference, load, markSeen]);

  if (!order) return <Loading error={error} />;
  return <Loaded order={order} setOrder={setOrder} error={error} load={load} refreshFeed={refreshFeed} />;
}

function Loading({ error }) {
  return (
    <>
      <Link className="st-back" to="/equipe/commandes">‹ Commandes</Link>
      {error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="st-muted">Chargement de la commande…</p>}
    </>
  );
}

// Commande chargée (composant à part : useSteps a besoin de la commande)
function Loaded({ order, setOrder, error, load, refreshFeed }) {
  const o = order;
  const updated = (next) => {
    setOrder(next);
    refreshFeed();
  };
  const steps = useSteps(o, updated, load);

  return (
    <div className="st-detail">
      <Link className="st-back" to="/equipe/commandes">‹ Commandes</Link>

      <div className="st-detail-head">
        <div>
          <h1 className="st-title">{o.reference}</h1>
          <p className="st-muted">Reçue le {formatDateTime(o.createdAt)} · {timeAgo(o.createdAt)}</p>
        </div>
        <span className={`st-pill p-${o.status}`}>{STATUS_LABEL[o.status]}</span>
      </div>

      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error.message}</span></div>}

      <Notice order={o} steps={steps} onChange={updated} />
      <Actions order={o} steps={steps} />

      <div className="st-grid">
        <DeliveryFee order={o} steps={steps} />

        <section className="st-box">
          <h2>Client</h2>
          <p className="st-big">{o.customerName}</p>
          <p className="st-phone">{formatPhone(o.customerPhone)}</p>
          <div className="st-links">
            <a className="st-link" href={telHref(o.customerPhone)}>Appeler</a>
            <a className="st-link wa" href={whatsappHref(o.customerPhone)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </section>

        <section className="st-box">
          <h2>Paiement</h2>
          <dl className="st-dl">
            <dt>Moyen</dt><dd>{METHOD_LABEL[o.paymentMethod]}</dd>
            <dt>Numéro ayant payé</dt>
            <dd>{o.paymentPayerPhone ? <a href={telHref(o.paymentPayerPhone)}>{formatPhone(o.paymentPayerPhone)}</a> : '—'}</dd>
            <dt>Montant à recevoir</dt><dd><b>{formatPrice(o.itemsTotal)}</b></dd>
          </dl>
          <p className="st-note">
            Plats seulement. Frais de livraison :{' '}
            {o.deliveryFee == null ? 'pas encore saisis' : `${formatPrice(o.deliveryFee)}, ${o.deliveryFeeReceivedAt ? 'reçus' : 'à recevoir'}`}.
          </p>
        </section>

        <section className="st-box">
          <h2>Livraison</h2>
          {o.location ? (
            <a className="st-link maps" href={mapsHref(o.location)} target="_blank" rel="noreferrer">
              Ouvrir la position dans Google Maps
              {o.location.accuracy != null && <small>précision d'environ {o.location.accuracy} m</small>}
            </a>
          ) : (
            <p className="st-muted">Position non partagée par le client.</p>
          )}
          <h3>Repères</h3>
          <p>{o.addressNote || <span className="st-muted">Aucun repère indiqué.</span>}</p>
        </section>

        <section className="st-box st-items">
          <h2>Plats</h2>
          <ul>
            {o.items.map((i, k) => {
              const details = [i.variantLabel, i.choice].filter(Boolean).join(' · ');
              return (
                <li key={k}>
                  <span className="st-qty">{i.quantity} ×</span>
                  <span className="st-item">
                    <b>{i.productNumber != null && `N° ${i.productNumber} · `}{i.productName}</b>
                    {details && <small>{details}</small>}
                    {i.note && <em>Note : {i.note}</em>}
                  </span>
                  <span className="st-amount">{formatPrice(i.lineTotal)}</span>
                </li>
              );
            })}
          </ul>
          <div className="st-total"><span>Total des plats</span><b>{formatPrice(o.itemsTotal)}</b></div>
        </section>

        <section className="st-box">
          <h2>Historique</h2>
          <ol className="st-history">
            {timelineOf(o).map((h, k) => (
              <li key={k} className={h.kind}>
                <b>{h.title}</b>
                <span>{formatDateTime(h.at)}{h.by && ` · ${h.by}`}</span>
                {h.note && <em>{h.note}</em>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
