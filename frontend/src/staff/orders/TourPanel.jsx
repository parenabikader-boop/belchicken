import { useState } from 'react';
import { staffApi } from '../../api/client.js';
import { useAppSettings } from '../settings/useAppSettings.js';
import { CourierPicker } from './OrderSteps.jsx';
import { isPartner, isPickup } from './labels.js';

const RUN_MAX = 10; // comme le serveur (dispatch.js)

// Lot 5c : tournée des livreurs du restaurant (réglage du Patron « Tournées et disponibilité »).
// Plusieurs commandes « En préparation » partent avec le même livreur ; chacune garde son code de remise,
// ses frais et son message « en route » à envoyer au client (depuis sa fiche). Tout ou rien : le serveur
// refuse la tournée si une seule commande ne peut pas partir (frais, client pas prévenu…).
export default function TourPanel({ orders, onDone }) {
  const { restaurantDispatch } = useAppSettings();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [courierId, setCourierId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const ready = orders.filter((o) => o.status === 'EN_PREPARATION' && !isPickup(o) && !isPartner(o));
  if (!restaurantDispatch || (ready.length < 2 && !open && !done)) return null;

  const toggle = (ref) => setPicked((p) => (p.includes(ref) ? p.filter((r) => r !== ref) : [...p, ref].slice(0, RUN_MAX)));
  const close = () => {
    setOpen(false);
    setPicked([]);
    setCourierId('');
    setError('');
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const chosen = ready.filter((o) => picked.includes(o.reference));
      await staffApi.restaurantTour(courierId, chosen.map((o) => ({ reference: o.reference, from: o.status })));
      setDone(`${chosen.length} commandes parties avec le même livreur. Envoyez maintenant le message « en route » de chacune (depuis sa fiche).`);
      close();
      onDone?.();
    } catch (err) {
      setError(err.message);
      onDone?.();
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="tr-bar">
        {done && <div className="alert ok" role="status"><span>{done}</span></div>}
        {ready.length >= 2 && (
          <button type="button" className="btn btn-s btn-sm" onClick={() => { setDone(''); setOpen(true); }}>
            Tournée : faire partir plusieurs commandes avec un livreur
          </button>
        )}
      </div>
    );
  }

  return (
    <form className="st-action confirm tr-panel" onSubmit={submit}>
      <b>Quelles commandes partent ensemble ?</b>
      <div className="tr-list">
        {ready.map((o) => (
          <label key={o.reference} className={`tr-opt${picked.includes(o.reference) ? ' on' : ''}`}>
            <input type="checkbox" checked={picked.includes(o.reference)} onChange={() => toggle(o.reference)} />
            <span>
              <b>{o.reference}</b> · {o.customerName}
              {o.deliveryZoneName && <small>{o.deliveryZoneName}</small>}
            </span>
          </label>
        ))}
      </div>
      <b>Avec quel livreur ?</b>
      <CourierPicker value={courierId} onChange={setCourierId} />
      <p className="st-muted">
        Chaque commande garde son code de remise et ses frais. Le client de chaque commande doit déjà avoir été prévenu
        de la préparation, et les frais saisis. Au plus {RUN_MAX} commandes.
      </p>
      {error && <p className="st-err">{error}</p>}
      <div className="st-action-row">
        <button type="submit" className="btn btn-p" disabled={busy || picked.length < 1 || !courierId}>
          {busy ? 'Enregistrement…' : `Faire partir ${picked.length || ''} commande${picked.length > 1 ? 's' : ''}`}
        </button>
        <button type="button" className="st-text-btn" onClick={close}>Annuler</button>
      </div>
    </form>
  );
}
