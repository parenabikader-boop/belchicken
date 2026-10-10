import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatTime } from '../orders/labels.js';
import { Proofs } from '../orders/OrderSteps.jsx';
import { formatPrice, plural } from '../../utils/format.js';
import { nightLine } from '../../utils/deliveryFee.js';

// Lot 5c, page Livraison : nos commandes (mode Prestataire), sans jamais les ventes de Belchicken.
//   - À attribuer : en préparation ou prêtes, sans livreur ; une ou plusieurs confiées en une fois (tournée).
//   - À récupérer : confiées, pas encore récupérées ; livreur changé ou retiré ; récupérée sans le livreur (motif).
//   - En cours : livreur remplacé (le code du client reste le même).
//   - Livrées aujourd'hui : l'heure de chaque étape (preuves).
const RUN_MAX = 10; // comme le serveur (dispatch.js)
const feeShort = (o) => (o.deliveryFee === 0 ? 'Offerte' : o.deliveryFee != null ? formatPrice(o.deliveryFee) : '—');
const statusText = (o) => (o.status === 'PRETE_LIVRAISON' ? `Prête depuis ${formatTime(o.proofs?.readyAt || o.assignedAt)}` : 'En préparation');

export default function DispatchBoard({ data, onData }) {
  const [picked, setPicked] = useState([]);
  const [runCourier, setRunCourier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Commandes cochées qui ne sont plus à attribuer (mise à jour de la page) : décochées
  const toAssignRefs = data.toAssign.map((o) => o.reference).join(',');
  useEffect(() => {
    setPicked((p) => p.filter((r) => toAssignRefs.split(',').includes(r)));
  }, [toAssignRefs]);

  async function run(call, done) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      onData(await call());
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggle = (ref) => setPicked((p) => (p.includes(ref) ? p.filter((r) => r !== ref) : [...p, ref].slice(0, RUN_MAX)));
  const assign = async (e) => {
    e.preventDefault();
    const name = data.couriers.find((c) => c.id === runCourier)?.name;
    const n = picked.length;
    if (await run(() => staffApi.assignDeliveryRun(runCourier, picked), `${plural(n, 'commande')} confiée${n > 1 ? 's' : ''} à ${name}.`)) {
      setPicked([]);
      setRunCourier('');
    }
  };

  return (
    <>
      {error && <div className="alert err" role="alert" style={{ margin: '12px 0' }}><span>{error}</span></div>}
      {notice && <div className="alert ok" role="status" style={{ margin: '12px 0' }}><span>{notice}</span></div>}

      <h2 className="mn-section">À attribuer <span>{data.toAssign.length}</span></h2>
      <p className="od-hint">
        Commandes en préparation au restaurant, sans livreur. Cochez-en une ou plusieurs (une tournée), puis choisissez le
        livreur. Il reçoit une notification ; quand le sac est prêt, il le récupère et appuie sur « Commande récupérée ».
      </p>
      {data.toAssign.length === 0 ? (
        <p className="od-empty">Aucune commande à attribuer.</p>
      ) : (
        <form onSubmit={assign}>
          <ul className="dl-list">
            {data.toAssign.map((o) => (
              <li key={o.reference} className="dl-row">
                <label className="dl-check">
                  <input type="checkbox" checked={picked.includes(o.reference)} onChange={() => toggle(o.reference)} />
                  <span className="dl-main">
                    <b className="st-ref">{o.reference}</b>
                    <small>{statusText(o)}{o.deliveryZoneName && ` · ${o.deliveryZoneName}`}</small>
                  </span>
                </label>
                <b className="ca-amount">{feeShort(o)}</b>
              </li>
            ))}
          </ul>
          <div className="dl-inline">
            <CourierSelect couriers={data.couriers} value={runCourier} onChange={setRunCourier} label="Livreur" />
            <button type="submit" className="btn btn-p" disabled={busy || picked.length === 0 || !runCourier}>
              {picked.length > 1 ? `Confier ces ${picked.length} commandes` : 'Confier la commande'}
            </button>
          </div>
        </form>
      )}

      <h2 className="mn-section">À récupérer <span>{data.toPickUp.length}</span></h2>
      <p className="od-hint">Confiées à un livreur, pas encore récupérées. Le livreur peut encore être changé ou retiré.</p>
      {data.toPickUp.length === 0 ? (
        <p className="od-empty">Aucune commande à récupérer.</p>
      ) : (
        <ul className="dl-list">
          {data.toPickUp.map((o) => <WaitingRow key={o.reference} order={o} couriers={data.couriers} busy={busy} run={run} />)}
        </ul>
      )}

      <h2 className="mn-section">Courses en cours <span>{data.courses.length}</span></h2>
      {data.courses.length === 0 ? (
        <p className="od-empty">Aucune course en cours.</p>
      ) : (
        <ul className="dl-list">
          {data.courses.map((o) => <RideRow key={o.reference} order={o} couriers={data.couriers} busy={busy} run={run} />)}
        </ul>
      )}

      <h2 className="mn-section">Livrées aujourd’hui <span>{data.delivered.length}</span></h2>
      {data.delivered.length === 0 ? (
        <p className="od-empty">Aucune livraison aujourd’hui.</p>
      ) : (
        <ul className="dl-list">
          {data.delivered.map((o) => (
            <li key={o.reference} className="dl-row dl-col">
              <div className="dl-top">
                <div className="dl-main">
                  <b className="st-ref">{o.reference}</b>
                  <small>{o.courierName || 'Livreur ?'}{o.deliveryZoneName && ` · ${o.deliveryZoneName}`}</small>
                </div>
                <b className="ca-amount">{feeShort(o)}</b>
              </div>
              <Proofs proofs={o.proofs} />
            </li>
          ))}
        </ul>
      )}
      <p className="st-muted">Montant affiché : les frais de livraison à encaisser par le livreur.</p>
    </>
  );
}

// Livreurs de notre équipe : ceux en pause ne sont pas proposés (refusés par le serveur)
function CourierSelect({ couriers, value, onChange, label, exclude }) {
  const list = couriers.filter((c) => c.id !== exclude && c.state !== 'EN_PAUSE');
  return (
    <label className="dl-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{list.length ? 'Choisir…' : 'Aucun livreur disponible'}</option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.state === 'EN_COURSE' ? ` (en course : ${c.activeCourses})` : ''}</option>
        ))}
      </select>
    </label>
  );
}

// Confiée, pas encore récupérée : changer ou retirer le livreur ; récupérée sans qu'il ait appuyé (motif)
function WaitingRow({ order: o, couriers, busy, run }) {
  const [mode, setMode] = useState(null); // null | 'change' | 'pickup'
  const [courierId, setCourierId] = useState('');
  const [reason, setReason] = useState('');
  const ready = o.status === 'PRETE_LIVRAISON';
  return (
    <li className="dl-row dl-col">
      <div className="dl-top">
        <div className="dl-main">
          <b className="st-ref">{o.reference}</b> {ready && <span className="st-pickup st-ready">Prête</span>}
          <small>
            {o.courierName}{o.assignedAt && ` · confiée à ${formatTime(o.assignedAt)}`} · {statusText(o)}
            {o.deliveryZoneName && ` · ${o.deliveryZoneName}`}
          </small>
        </div>
        <b className="ca-amount">{feeShort(o)}</b>
      </div>
      {mode === 'change' ? (
        <form className="dl-inline" onSubmit={async (e) => { e.preventDefault(); if (await run(() => staffApi.setDeliveryCourier(o.reference, courierId), `${o.reference} : livreur changé.`)) setMode(null); }}>
          <CourierSelect couriers={couriers} value={courierId} onChange={setCourierId} label="Nouveau livreur" exclude={o.courierId} />
          <button type="submit" className="btn btn-p btn-sm" disabled={busy || !courierId}>Confier</button>
          <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Annuler</button>
        </form>
      ) : mode === 'pickup' ? (
        <form className="dl-reason" onSubmit={async (e) => { e.preventDefault(); if (await run(() => staffApi.deliveryPickUp(o.reference, reason), `${o.reference} : récupération confirmée.`)) setMode(null); }}>
          <label htmlFor={`pk-${o.reference}`}>{o.courierName} a pris le sac sans appuyer sur « Commande récupérée » : pourquoi ?</label>
          <textarea id={`pk-${o.reference}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : téléphone du livreur éteint…" autoFocus />
          <div className="dl-inline">
            <button type="submit" className="btn btn-p btn-sm" disabled={busy || reason.trim().length < 3}>Confirmer la récupération</button>
            <button type="button" className="st-text-btn" onClick={() => setMode(null)}>Annuler</button>
          </div>
        </form>
      ) : (
        <div className="dl-inline">
          <button type="button" className="btn btn-s btn-sm" disabled={busy} onClick={() => { setCourierId(''); setMode('change'); }}>Changer de livreur</button>
          <button type="button" className="st-text-btn" disabled={busy} onClick={() => run(() => staffApi.removeDeliveryCourier(o.reference), `${o.reference} : livreur retiré, commande à attribuer.`)}>Retirer le livreur</button>
          {ready && <button type="button" className="st-text-btn" disabled={busy} onClick={() => { setReason(''); setMode('pickup'); }}>Récupérée sans le livreur</button>}
        </div>
      )}
    </li>
  );
}

// En cours : le livreur peut être remplacé (le code du client reste le même)
function RideRow({ order: o, couriers, busy, run }) {
  const [changing, setChanging] = useState(false);
  const [courierId, setCourierId] = useState('');
  return (
    <li className="dl-row dl-col">
      <div className="dl-top">
        <div className="dl-main">
          <b className="st-ref">{o.reference}</b>
          <small>
            {o.courierName || 'Livreur ?'}
            {o.proofs?.pickedUpAt && ` · récupérée à ${formatTime(o.proofs.pickedUpAt)}`}
            {o.deliveryZoneName && ` · ${o.deliveryZoneName}`}
            {o.deliveryNightFee > 0 && ` · ${nightLine(o.deliveryNightFee)}`}
          </small>
        </div>
        <b className="ca-amount">{feeShort(o)}</b>
      </div>
      {changing ? (
        <form className="dl-inline" onSubmit={async (e) => { e.preventDefault(); if (await run(() => staffApi.setDeliveryCourier(o.reference, courierId), `${o.reference} : livreur remplacé.`)) setChanging(false); }}>
          <CourierSelect couriers={couriers} value={courierId} onChange={setCourierId} label="Remplacer par" exclude={o.courierId} />
          <button type="submit" className="btn btn-p btn-sm" disabled={busy || !courierId}>Confier</button>
          <button type="button" className="st-text-btn" onClick={() => setChanging(false)}>Annuler</button>
        </form>
      ) : (
        <div className="dl-inline">
          <button type="button" className="st-text-btn" disabled={busy} onClick={() => { setCourierId(''); setChanging(true); }}>Remplacer le livreur</button>
        </div>
      )}
    </li>
  );
}
