import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import { useOrdersFeed } from './OrdersFeed.jsx';
import {
  ACTIVE, deliveryBlock, FEE_EDITABLE, formatDateTime, formatPhone, formatTime, mapsHref, METHOD_LABEL, NEXT_ACTION, STATUS_LABEL,
  telHref, timeAgo, timelineOf, whatsappHref,
} from './labels.js';

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

  if (!order) {
    return (
      <>
        <Link className="st-back" to="/equipe/commandes">‹ Commandes</Link>
        {error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="st-muted">Chargement de la commande…</p>}
      </>
    );
  }

  const o = order;
  const updated = (next) => {
    setOrder(next);
    refreshFeed();
  };

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

      <Actions order={o} onChange={updated} onConflict={load} />

      <div className="st-grid of-row">
        <DeliveryFee order={o} onChange={updated} onConflict={load} />
        <CustomerMessage order={o} onLogged={load} />
      </div>

      <div className="st-grid">
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

// Boutons : statut suivant (avec confirmation pour le paiement) et annulation avec motif
function Actions({ order: o, onChange, onConflict }) {
  const next = NEXT_ACTION[o.status];
  const [mode, setMode] = useState(null); // null | 'confirm-pay' | 'cancel'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Changement de statut par un collègue : on referme ce qui était ouvert
  useEffect(() => {
    setMode(null);
    setError('');
  }, [o.status]);

  if (!ACTIVE.includes(o.status)) return null;

  const send = async (to, extra = {}) => {
    setBusy(true);
    setError('');
    try {
      onChange(await staffApi.setStatus(o.reference, { from: o.status, to, ...extra }));
      setReason('');
    } catch (e) {
      setError(e.message);
      if (e.status === 409) onConflict();
    }
    setBusy(false);
  };

  if (mode === 'confirm-pay') {
    return (
      <div className="st-action confirm">
        <b>Avez-vous vérifié le paiement sur le téléphone marchand ?</b>
        <p>
          <strong>{formatPrice(o.itemsTotal)}</strong> reçus par {METHOD_LABEL[o.paymentMethod]}
          {o.paymentPayerPhone && <> depuis le <strong>{formatPhone(o.paymentPayerPhone)}</strong></>}.
        </p>
        {error && <p className="st-err">{error}</p>}
        <div className="st-action-row">
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => send('PAYEE')}>{busy ? 'Enregistrement…' : 'Oui, paiement reçu'}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
      </div>
    );
  }

  if (mode === 'cancel') {
    return (
      <form className="st-action cancel" onSubmit={(e) => { e.preventDefault(); send('ANNULEE', { reason }); }}>
        <label htmlFor="st-reason"><b>Motif de l'annulation</b></label>
        <textarea id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : paiement non reçu, client injoignable…" autoFocus />
        {error && <p className="st-err">{error}</p>}
        <div className="st-action-row">
          <button type="submit" className="btn st-btn-danger" disabled={busy || reason.trim().length < 3}>{busy ? 'Annulation…' : "Confirmer l'annulation"}</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Retour</button>
        </div>
      </form>
    );
  }

  const blocked = next.to === 'EN_LIVRAISON' ? deliveryBlock(o) : null;

  return (
    <div className="st-action">
      {blocked && <p className="st-verify-hint">{blocked}</p>}
      {o.status === 'PAIEMENT_A_VERIFIER' && (
        <p className="st-verify-hint">
          Vérifiez sur le téléphone marchand l'arrivée de <b>{formatPrice(o.itemsTotal)}</b> par {METHOD_LABEL[o.paymentMethod]}
          {o.paymentPayerPhone && <> depuis le <b>{formatPhone(o.paymentPayerPhone)}</b></>}.
        </p>
      )}
      {error && <p className="st-err">{error}</p>}
      <div className="st-action-row">
        <button type="button" className="btn btn-p st-next" disabled={busy || Boolean(blocked)} onClick={() => (next.to === 'PAYEE' ? setMode('confirm-pay') : send(next.to))}>
          {busy ? 'Enregistrement…' : next.label}
        </button>
        <button type="button" className="st-text-btn danger" onClick={() => setMode('cancel')}>Annuler la commande</button>
      </div>
      <p className="st-muted st-since">Statut actuel depuis {formatTime(o.history.at(-1)?.at || o.createdAt)}</p>
    </div>
  );
}

// Frais de livraison : montant selon le quartier, puis « Frais reçus » après vérification
// sur le téléphone marchand. Patron et Opérateur.
function DeliveryFee({ order: o, onChange, onConflict }) {
  const editable = FEE_EDITABLE.includes(o.status);
  const received = Boolean(o.deliveryFeeReceivedAt);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Changement par un collègue : on referme la saisie
  useEffect(() => {
    setEditing(false);
    setError('');
  }, [o.deliveryFee, o.deliveryFeeReceivedAt, o.status]);

  const run = async (call) => {
    setBusy(true);
    setError('');
    try {
      onChange(await call());
      setEditing(false);
    } catch (e) {
      setError(e.message);
      if (e.status === 409) onConflict();
    }
    setBusy(false);
  };

  const save = (e) => {
    e.preventDefault();
    const amount = Number(value.replace(/\s/g, ''));
    if (!Number.isInteger(amount) || amount < 1) return setError('Indiquez le montant en F (au moins 1 F).');
    run(() => staffApi.setDeliveryFee(o.reference, amount));
  };

  const showForm = editable && !received && (editing || o.deliveryFee == null);

  return (
    <section className={`st-box of-fee${received ? ' ok' : o.deliveryFee == null && editable ? ' todo' : ''}`}>
      <h2>Frais de livraison</h2>
      {showForm ? (
        <form className="of-fee-form" onSubmit={save}>
          <label htmlFor="of-fee" className="st-muted">Montant selon le quartier du client</label>
          <div className="of-fee-row">
            <span className="of-amount">
              <input id="of-fee" type="text" inputMode="numeric" autoComplete="off" placeholder="ex. 1000" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ''))} />
              <span>F</span>
            </span>
            <button type="submit" className="btn btn-p" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
            {o.deliveryFee != null && <button type="button" className="st-text-btn" onClick={() => setEditing(false)}>Annuler</button>}
          </div>
        </form>
      ) : (
        <p className="of-fee-value">
          {o.deliveryFee == null ? <span className="st-muted">Pas de frais saisis.</span> : <b>{formatPrice(o.deliveryFee)}</b>}
          {editable && !received && o.deliveryFee != null && (
            <button type="button" className="st-text-btn" onClick={() => { setValue(String(o.deliveryFee)); setEditing(true); }}>Modifier</button>
          )}
        </p>
      )}

      {o.deliveryFee != null && (
        <label className={`of-check${!editable ? ' locked' : ''}`}>
          <input type="checkbox" checked={received} disabled={busy || !editable} onChange={(e) => run(() => staffApi.setFeeReceived(o.reference, e.target.checked))} />
          <span>
            <b>Frais reçus</b>
            <small>{received ? `Reçus à ${formatTime(o.deliveryFeeReceivedAt)}` : 'À cocher après vérification sur le téléphone marchand.'}</small>
          </span>
        </label>
      )}
      {error && <p className="st-err">{error}</p>}
      {editable && !received && o.deliveryFee != null && <p className="st-note">Le livreur part une fois les frais reçus.</p>}
    </section>
  );
}

// Message de l'étape en cours, prêt à ouvrir dans WhatsApp sur le téléphone de l'agent (lien wa.me).
// Le lien est un vrai lien : touché directement, le téléphone ouvre WhatsApp sans blocage.
function CustomerMessage({ order: o, onLogged }) {
  const m = o.customerMessage;
  if (!m) {
    return (
      <section className="st-box of-msg">
        <h2>Prévenir le client sur WhatsApp</h2>
        <p className="st-muted">Rien à envoyer pour l’instant : un message sera proposé une fois le paiement vérifié.</p>
      </section>
    );
  }
  const prepared = (o.events || []).filter((e) => e.type === 'MESSAGE_PREPARE' && e.messageKey === m.key).at(-1);
  const log = () => staffApi.logMessage(o.reference, m.key).then(onLogged, () => {});

  return (
    <section className="st-box of-msg">
      <h2>Prévenir le client sur WhatsApp</h2>
      <p className="of-msg-label">{m.label}</p>
      {m.missing ? (
        <>
          <p className="st-verify-hint">{m.missing}</p>
          <button type="button" className="btn btn-wa" disabled>Ouvrir WhatsApp</button>
        </>
      ) : (
        <>
          <p className="of-bubble">{m.text}</p>
          <a className="btn btn-wa" href={m.url} target="_blank" rel="noreferrer" onClick={log}>
            {prepared ? 'Ouvrir WhatsApp à nouveau' : 'Ouvrir WhatsApp avec ce message'}
          </a>
        </>
      )}
      {prepared && <p className="st-note">Déjà préparé à {formatTime(prepared.at)}{prepared.by && ` par ${prepared.by}`}.</p>}
    </section>
  );
}
