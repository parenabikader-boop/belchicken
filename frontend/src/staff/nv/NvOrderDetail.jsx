import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, MapPin, MessageCircle, Phone, Printer, Smartphone } from 'lucide-react';
import { staffApi } from '../../api/client.js';
import { drinksLabel } from '../../utils/drinks.js';
import { formatPrice } from '../../utils/format.js';
import { useOrdersFeed } from '../orders/OrdersFeed.jsx';
import {
  FEE_METHOD_LABEL, formatDateTime, formatPhone, INDEPENDENT_NOTE, isIndependent, isPickup, mapsHref, METHOD_LABEL, statusLabel,
  telHref, timeAgo, timelineOf, whatsappHref,
} from '../orders/labels.js';
import { Actions, CourierBox, DeliveryFee, Notice, useSteps } from '../orders/OrderSteps.jsx';
import { OrderReview } from '../orders/OrderDetail.jsx';
import { initials, progressStep, tintOf, toneOf } from './visual.js';
import './theme.css';

// Nouveau visuel : détail d'une commande. Mêmes données (GET /api/staff/orders/:reference, toutes les 5 s) et mêmes
// actions que le détail actuel : le message au client (Notice) et le bouton de l'étape (Actions) sont les mêmes
// composants, seulement présentés autrement (bouton principal fixé en bas sur téléphone).
const REFRESH_MS = 5000;

export default function NvOrderDetail() {
  const { reference } = useParams();
  const { markSeen, refresh: refreshFeed } = useOrdersFeed();
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

  useEffect(() => {
    markSeen(reference.toUpperCase());
    load();
    const t = setInterval(() => !document.hidden && load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [reference, load, markSeen]);

  if (!order) {
    return (
      <div className="nvd">
        <Link className="nv-back" to="/equipe/commandes"><ChevronLeft size={20} aria-hidden="true" /> Commandes</Link>
        {error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="nv-muted">Chargement de la commande…</p>}
      </div>
    );
  }
  return <Loaded order={order} setOrder={setOrder} error={error} load={load} refreshFeed={refreshFeed} />;
}

const SEGMENTS = ['Paiement', 'Cuisine', 'En route', 'Livrée'];
const PICKUP_SEGMENTS = ['Paiement', 'Cuisine', 'Prête', 'Retirée'];

function Progress({ o }) {
  const step = progressStep(o.status);
  const labels = isPickup(o) ? PICKUP_SEGMENTS : SEGMENTS;
  if (step < 0) return null;
  return (
    <ol className="nv-progress" aria-label={`Étape ${step + 1} sur 4 : ${labels[step]}`}>
      {labels.map((l, i) => (
        <li key={l} className={i < step ? 'done' : i === step ? 'now' : ''}>
          <span className="nv-progress-bar" aria-hidden="true" />
          <span className="nv-progress-l">{l}</span>
        </li>
      ))}
    </ol>
  );
}

function Loaded({ order: o, setOrder, error, load, refreshFeed }) {
  const updated = (next) => {
    setOrder(next);
    refreshFeed();
  };
  const steps = useSteps(o, updated, load);
  const pickup = isPickup(o);
  const toVerify = o.status === 'PAIEMENT_A_VERIFIER';

  return (
    <div className="nvd">
      <div className="nvd-top">
        <Link className="nv-back" to="/equipe/commandes" aria-label="Retour aux commandes"><ChevronLeft size={22} aria-hidden="true" /></Link>
        <div className="nvd-ref">
          <h1 className="nv-title">{o.reference}</h1>
          <p className="nv-muted">Reçue le {formatDateTime(o.createdAt)} · {timeAgo(o.createdAt)}</p>
        </div>
        <span className={`nv-step ${toneOf(o)}`}>{statusLabel(o)}</span>
      </div>
      <p className="nvd-tags">
        {pickup && <span className="nv-tag">À emporter</span>}
        {o.deliveryOperator === 'PRESTATAIRE' && <span className="nv-tag">Livraison Prestataire</span>}
        {isIndependent(o) && <span className="nv-tag">Livreur indépendant</span>}
        {o.language === 'EN' && <span className="nv-tag">Client anglophone</span>}
        <span className="nv-tag soft">Provenance : {o.source || 'Site'} · Saisie par : {o.enteredBy || 'le client, sur le site'}</span>
      </p>

      <Progress o={o} />

      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}

      {/* Paiement Mobile Money : à vérifier sur le téléphone marchand, ou déjà vérifié */}
      <section className={`nv-card nvd-pay${toVerify ? ' todo' : ''}`}>
        <span className="nv-ico orange" aria-hidden="true"><Smartphone size={22} /></span>
        <div>
          <h2>{toVerify ? 'Paiement Mobile Money à vérifier' : 'Paiement Mobile Money'}</h2>
          <p className="nvd-pay-amount">{formatPrice(o.itemsTotal)}</p>
          <p className="nv-muted">
            {METHOD_LABEL[o.paymentMethod]}
            {o.paymentPayerPhone && <> · depuis le <a href={telHref(o.paymentPayerPhone)}>{formatPhone(o.paymentPayerPhone)}</a></>}
          </p>
          <p className="nv-muted">
            {o.paymentVerified ? <>Vérifié par {o.paymentVerified.by || '—'}, le {formatDateTime(o.paymentVerified.at)}</> : 'À vérifier sur le téléphone marchand avant de confirmer.'}
          </p>
        </div>
      </section>

      {/* Message au client et bouton de l'étape : les composants actuels, inchangés */}
      <div className="nvd-steps">
        <Notice order={o} steps={steps} onChange={updated} />
        <Actions order={o} steps={steps} />
      </div>

      <OrderReview order={o} />

      <div className="nvd-grid">
        <section className="nv-card nvd-client">
          <div className="nvd-client-top">
            <span className={`nv-ini big t${tintOf(o.customerName)}`} aria-hidden="true">{initials(o.customerName)}</span>
            <div>
              <h2 className="nvd-client-name">{o.customerName}</h2>
              <p className="nv-muted">{formatPhone(o.customerPhone)}</p>
            </div>
          </div>
          <div className="nvd-client-btns">
            <a className="nv-btn nv-btn-s" href={telHref(o.customerPhone)}><Phone size={18} aria-hidden="true" /> Appeler</a>
            <a className="nv-btn nv-btn-wa" href={whatsappHref(o.customerPhone)} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" /> WhatsApp</a>
          </div>
        </section>

        <section className="nv-card nvd-items">
          <h2>Articles</h2>
          <ul>
            {o.items.map((i, k) => {
              const details = [i.variantLabel, i.choice].filter(Boolean).join(' · ');
              return (
                <li key={k}>
                  <span className="nvd-qty">{i.quantity}×</span>
                  <span className="nvd-item">
                    <b>{i.productNumber != null && `N° ${i.productNumber} · `}{i.productName}</b>
                    {details && <small>{details}</small>}
                    {i.drinks?.length > 0 && <small>{drinksLabel(i.drinks, i.quantity)}</small>}
                    {i.note && <em>Note : {i.note}</em>}
                  </span>
                  <span className="nvd-line">{formatPrice(i.lineTotal)}</span>
                </li>
              );
            })}
          </ul>
          <div className="nvd-total"><span>Total des plats</span><b>{formatPrice(o.itemsTotal)}</b></div>
          {!pickup && (
            <p className="nv-muted nvd-fee-line">
              Frais de livraison :{' '}
              {isIndependent(o)
                ? INDEPENDENT_NOTE.replace('Livreur indépendant : f', 'f')
                : o.deliveryFee == null
                  ? o.deliveryFeeSource === 'A_CONFIRMER' ? 'à confirmer avec le client.' : 'pas encore saisis.'
                  : o.deliveryFee === 0
                    ? 'livraison offerte.'
                    : `${formatPrice(o.deliveryFee)}, ${o.deliveryFeeMethod ? `payés ${FEE_METHOD_LABEL[o.deliveryFeeMethod]}` : 'payés au livreur à la réception'}.`}
            </p>
          )}
        </section>

        <CourierBox order={o} onChange={updated} />
        {!pickup && <DeliveryFee order={o} steps={steps} />}

        {pickup ? (
          <section className="nv-card">
            <h2>À emporter</h2>
            <p>Le client vient retirer sa commande au restaurant. Pas de livreur, pas de frais.</p>
          </section>
        ) : (
          <section className="nv-card">
            <h2>Livraison</h2>
            {o.location ? (
              <a className="nv-btn nv-btn-s nv-btn-block" href={mapsHref(o.location)} target="_blank" rel="noreferrer">
                <MapPin size={18} aria-hidden="true" /> Ouvrir la position dans Google Maps
              </a>
            ) : <p className="nv-muted">Position non partagée par le client.</p>}
            {o.location?.accuracy != null && <p className="nv-muted">Précision d’environ {o.location.accuracy} m</p>}
            <h3>Repères</h3>
            <p>{o.addressNote || <span className="nv-muted">Aucun repère indiqué.</span>}</p>
          </section>
        )}

        <section className="nv-card">
          <h2>Bon de commande</h2>
          <div className="nvd-slip">
            <Link className="nv-btn nv-btn-s" to={`/equipe/commandes/${o.reference}/bon?format=80`} target="_blank" rel="noopener"><Printer size={18} aria-hidden="true" /> Bon 80 mm</Link>
            <Link className="nv-btn nv-btn-s" to={`/equipe/commandes/${o.reference}/bon?format=a4`} target="_blank" rel="noopener"><Printer size={18} aria-hidden="true" /> Bon A4</Link>
          </div>
        </section>

        <section className="nv-card nvd-history">
          <h2>Historique</h2>
          <ol>
            {timelineOf(o).map((h, k) => (
              <li key={k}>
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
