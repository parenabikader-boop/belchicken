import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { formatPrice, plural } from '../../utils/format.js';
import { nightLine } from '../../utils/deliveryFee.js';
import { formatDateTime, formatPhone, formatTime, timeAgo } from '../orders/labels.js';

const REFRESH_MS = 15000;

// Page Caisse (Patron et Opérateur) : frais de livraison payés au livreur à la réception.
//   - Frais à vérifier : payés par mobile money (code marchand), à cocher après vérification.
//   - Caisse livreurs : espèces encore chez chaque livreur, bouton « Espèces remises », historique.
// Adresse : ?onglet=verifier|livreurs
// Lot 5b : seulement les commandes livrées par le restaurant ; celles de notre partenaire de livraison sont
// dans sa caisse (page Livraison, même écran).
const RESTAURANT_CASH = { load: staffApi.cash, verify: staffApi.setFeeVerified, remit: staffApi.remitCash };

export default function CashPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('onglet') === 'livreurs' ? 'livreurs' : 'verifier';
  return (
    <>
      <div className="st-head">
        <h1 className="st-title">Caisse</h1>
        <span className="st-muted">Frais de livraison payés au livreur</span>
      </div>
      <CashBoard tab={tab} onTab={(t) => setParams(t === 'livreurs' ? { onglet: 'livreurs' } : {})} cashApi={RESTAURANT_CASH} />
    </>
  );
}

// Les deux onglets de la caisse. partner (lot 5b) : caisse de notre équipe de livraison (page Livraison) :
// les références ne mènent pas au détail des commandes, que le Responsable livraison ne voit jamais.
export function CashBoard({ tab, onTab, cashApi, partner = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await cashApi.load());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [cashApi]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const cashTotal = data ? data.couriers.reduce((s, c) => s + c.amount, 0) : 0;

  const ctx = { cashApi, partner };
  return (
    <>
      <nav className="od-tabs" aria-label="Caisse">
        <button type="button" className={`od-tab${tab === 'verifier' ? ' on' : ''}${data?.toVerify.length ? ' has warn' : ''}`} aria-pressed={tab === 'verifier'} onClick={() => onTab('verifier')}>
          Frais à vérifier <span>{data ? data.toVerify.length : '…'}</span>
        </button>
        <button type="button" className={`od-tab${tab === 'livreurs' ? ' on' : ''}${cashTotal ? ' has' : ''}`} aria-pressed={tab === 'livreurs'} onClick={() => onTab('livreurs')}>
          Caisse livreurs <span>{data ? formatPrice(cashTotal) : '…'}</span>
        </button>
      </nav>

      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error} Nouvel essai automatique…</span></div>}
      {!data ? (
        !error && <p className="st-muted">Chargement de la caisse…</p>
      ) : tab === 'verifier' ? (
        <ToVerify data={data} onChange={load} ctx={ctx} />
      ) : (
        <Couriers data={data} onChange={load} ctx={ctx} />
      )}
    </>
  );
}

// ─────────── Frais à vérifier (mobile money) ───────────
function ToVerify({ data, onChange, ctx }) {
  return (
    <>
      <p className="od-hint ca-hint">
        Frais payés par Orange Money, Moov Money ou Telecel Money (code marchand), à la réception. Vérifiez sur {ctx.partner ? 'notre' : 'le'} téléphone marchand que le montant est
        bien arrivé, puis cochez.
      </p>
      {data.toVerify.length === 0 ? (
        <p className="od-empty">Aucuns frais à vérifier.</p>
      ) : (
        <ul className="ca-list">
          {data.toVerify.map((o) => <FeeRow key={o.reference} row={o} onChange={onChange} ctx={ctx} />)}
        </ul>
      )}
      {data.verified.length > 0 && (
        <section className="ca-sec">
          <h2>Vérifiés ces dernières 24 h</h2>
          <ul className="ca-list">
            {data.verified.map((o) => <FeeRow key={o.reference} row={o} onChange={onChange} ctx={ctx} />)}
          </ul>
        </section>
      )}
    </>
  );
}

// Référence d'une commande : lien vers son détail, sauf pour notre équipe de livraison
function Ref({ reference, partner, className }) {
  if (partner) return <span className={className}>{reference}</span>;
  return <Link to={`/equipe/commandes/${reference}`} className={className}>{reference}</Link>;
}

function FeeRow({ row: o, onChange, ctx }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verified = Boolean(o.verifiedAt);
  const set = async (value) => {
    setBusy(true);
    setError('');
    try {
      await ctx.cashApi.verify(o.reference, value);
      await onChange();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  return (
    <li className={`ca-row${verified ? ' done' : ''}`}>
      <div className="ca-main">
        <Ref reference={o.reference} partner={ctx.partner} className="st-ref" />
        <span>{o.customerName} · {formatPhone(o.customerPhone)}</span>
        <small className="st-muted">
          Livrée{o.courierName && ` par ${o.courierName}`}{o.deliveredAt && ` ${timeAgo(o.deliveredAt)}`}
          {o.deliveryZoneName && ` · ${o.deliveryZoneName}`}
          {verified && ` · vérifiés à ${formatTime(o.verifiedAt)}`}
          {o.deliveryNightFee > 0 && ` · ${nightLine(o.deliveryNightFee)}`}
        </small>
      </div>
      <b className="ca-amount">{formatPrice(o.deliveryFee)}</b>
      {verified ? (
        <button type="button" className="st-text-btn" disabled={busy} onClick={() => set(false)}>Annuler</button>
      ) : (
        <button type="button" className="btn btn-p ca-btn" disabled={busy} onClick={() => set(true)}>{busy ? 'Enregistrement…' : 'Vérifié sur le téléphone marchand'}</button>
      )}
      {error && <p className="st-err">{error}</p>}
    </li>
  );
}

// ─────────── Caisse livreurs (espèces) ───────────
function Couriers({ data, onChange, ctx }) {
  return (
    <>
      <p className="od-hint ca-hint">
        Espèces encaissées par chaque livreur et pas encore remises {ctx.partner ? 'au responsable livraison' : 'au restaurant'}. Comptez l’argent avec le livreur, puis appuyez sur « Espèces
        remises ».
      </p>
      {data.couriers.length === 0 ? (
        <p className="od-empty">{ctx.partner ? 'Aucun livreur actif dans notre équipe.' : 'Aucun compte livreur actif. Le Patron les crée sur la page Équipe.'}</p>
      ) : (
        <div className="ca-couriers">
          {data.couriers.map((c) => <CourierCash key={c.courierId || c.courierName} cash={c} onChange={onChange} ctx={ctx} />)}
        </div>
      )}

      <section className="ca-sec">
        <h2>Remises d’espèces</h2>
        {data.remittances.length === 0 ? (
          <p className="st-muted">Aucune remise pour l’instant.</p>
        ) : (
          <ul className="ca-history">
            {data.remittances.map((r) => (
              <li key={r.id}>
                <span>
                  <b>{r.courierName}</b> a remis <b>{formatPrice(r.amount)}</b>
                  <small className="st-muted"> · {plural(r.orderCount, 'course')}</small>
                </span>
                <small className="st-muted">{formatDateTime(r.at)} · reçu par {r.receivedBy}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CourierCash({ cash: c, onChange, ctx }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const remit = async () => {
    setBusy(true);
    setError('');
    try {
      const { remittance } = await ctx.cashApi.remit(c.courierId, c.orders.map((o) => o.reference));
      await onChange(); // montants et historique à jour avant la confirmation
      setDone(remittance);
      setConfirming(false);
    } catch (e) {
      setError(e.message);
      onChange(); // une course a changé : on recharge
    }
    setBusy(false);
  };

  return (
    <article className={`st-box ca-courier${c.amount ? ' has' : ''}`}>
      <header>
        <b>{c.courierName}</b>
        <span className="ca-amount">{formatPrice(c.amount)}</span>
      </header>
      {c.amount === 0 ? (
        <p className="st-muted">Aucune espèce à remettre.</p>
      ) : (
        <>
          <p className="st-muted">
            {plural(c.orders.length, 'course')} payée{c.orders.length > 1 ? 's' : ''} en espèces
            {c.older > 0 && <> · <b className="ca-old">dont {formatPrice(c.older)} des jours précédents</b></>}
          </p>
          <ul className="ca-orders">
            {c.orders.map((o) => (
              <li key={o.reference}>
                <Ref reference={o.reference} partner={ctx.partner} />
                <span>{o.customerName}</span>
                <small className="st-muted">{o.deliveredAt && formatDateTime(o.deliveredAt)}{o.deliveryZoneName && ` · ${o.deliveryZoneName}`}{o.deliveryNightFee > 0 && ` · ${nightLine(o.deliveryNightFee)}`}</small>
                <b>{formatPrice(o.deliveryFee)}</b>
              </li>
            ))}
          </ul>
          {confirming ? (
            <div className="st-action confirm">
              <b>{c.courierName} vous remet {formatPrice(c.amount)} en espèces ?</b>
              <p className="st-muted">Votre nom, l’heure et le montant sont enregistrés.</p>
              <div className="st-action-row">
                <button type="button" className="btn btn-p" disabled={busy} onClick={remit}>{busy ? 'Enregistrement…' : 'Oui, espèces reçues'}</button>
                <button type="button" className="st-text-btn" onClick={() => setConfirming(false)}>Retour</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-p btn-block" onClick={() => { setDone(null); setConfirming(true); }}>Espèces remises : {formatPrice(c.amount)}</button>
          )}
        </>
      )}
      {done && <p className="ca-done" role="status">✓ {formatPrice(done.amount)} remis par {done.courierName} ({plural(done.orderCount, 'course')}).</p>}
      {error && <p className="st-err">{error}</p>}
    </article>
  );
}
