import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { RESTAURANT } from '../../restaurant.js';
import { formatPrice } from '../../utils/format.js';

// Page « Frais de livraison » (Patron) : quartiers et leur prix, tranches de distance depuis le restaurant,
// option « Autre quartier ». Les frais sont calculés par le serveur et copiés dans chaque commande.

const feeText = (fee) => (fee === 0 ? 'Livraison offerte' : formatPrice(fee));
const kmText = (m) => `${String(Math.round(m / 100) / 10).replace('.', ',')} km`;
// « 1 500 », « 1500 F » -> 1500 ; vide ou illisible -> NaN
const parseFee = (v) => (String(v).trim() === '' ? NaN : Number(String(v).replace(/[\s  ]|f$/gi, '')));
const parseKm = (v) => Number(String(v).replace(',', '.').replace(/\s|km$/gi, ''));
const feeInput = (fee) => (fee == null ? '' : String(fee));

function FeeField({ id, value, onChange, label = 'Prix (F)' }) {
  return (
    <div className="f">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder="1000" />
      <span className="hint">0 = livraison offerte</span>
    </div>
  );
}

function Switch({ checked, onChange, disabled, label, on = 'Actif', off = 'Désactivé' }) {
  return (
    <label className={`mn-switch${disabled ? ' saving' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} />
      <span className="mn-track" aria-hidden="true" />
      <span className="mn-state">{checked ? on : off}</span>
    </label>
  );
}

// ─── Quartiers ───

function ZoneForm({ zone, onSave, onCancel }) {
  const [name, setName] = useState(zone?.name || '');
  const [fee, setFee] = useState(feeInput(zone?.fee));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const id = zone?.id || 'new';
  const submit = async (e) => {
    e.preventDefault();
    const amount = parseFee(fee);
    if (name.trim().length < 2) return setError('Indiquez le nom du quartier.');
    if (!Number.isInteger(amount) || amount < 0) return setError('Indiquez le prix en F (0 pour une livraison offerte).');
    setError('');
    setSending(true);
    try {
      await onSave({ name: name.trim(), fee: amount });
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };
  return (
    <form className="fe-form" onSubmit={submit} noValidate>
      <div className="fields">
        <div className="f">
          <label htmlFor={`fz-name-${id}`}>Quartier</label>
          <input id={`fz-name-${id}`} type="text" autoComplete="off" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ouaga 2000" autoFocus />
        </div>
        <FeeField id={`fz-fee-${id}`} value={fee} onChange={setFee} />
      </div>
      {error && <p className="st-err" role="alert">{error}</p>}
      <div className="st-action-row">
        <button type="submit" className="btn btn-p" disabled={sending}>{sending ? 'Enregistrement…' : zone ? 'Enregistrer' : 'Ajouter le quartier'}</button>
        <button type="button" className="st-text-btn" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function Zones({ zones, run }) {
  const [editing, setEditing] = useState(null); // id du quartier modifié, ou 'new'
  const [busy, setBusy] = useState(null);
  const move = (i, d) => {
    const ids = zones.map((z) => z.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    return run(() => staffApi.reorderDeliveryZones(ids));
  };
  const toggle = async (z) => {
    setBusy(z.id);
    await run(() => staffApi.updateDeliveryZone(z.id, { isActive: !z.isActive }));
    setBusy(null);
  };
  const save = (z) => async (body) => {
    await run(() => (z ? staffApi.updateDeliveryZone(z.id, body) : staffApi.createDeliveryZone(body)), { rethrow: true });
    setEditing(null);
  };
  const active = zones.filter((z) => z.isActive).length;

  return (
    <section className="st-box fe-sec">
      <h2>Quartiers</h2>
      <p className="st-muted">
        Le client choisit son quartier dans une liste, avec une recherche, et voit le prix avant de valider.
        L’ordre ci-dessous est celui de la liste. Un quartier désactivé n’est plus proposé, mais les commandes passées gardent son nom et son prix.
      </p>
      {zones.length > 0 && <p className="fe-count">{active} quartier{active > 1 ? 's' : ''} proposé{active > 1 ? 's' : ''} aux clients</p>}
      <ul className="fe-list">
        {zones.map((z, i) => (
          <li key={z.id} className={`fe-row${z.isActive ? '' : ' off'}`}>
            {editing === z.id ? (
              <ZoneForm zone={z} onSave={save(z)} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <span className="mn-arrows">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${z.name}`}>↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === zones.length - 1} aria-label={`Descendre ${z.name}`}>↓</button>
                </span>
                <span className="fe-name">{z.name}</span>
                <b className={`fe-fee${z.fee === 0 ? ' free' : ''}`}>{feeText(z.fee)}</b>
                <Switch checked={z.isActive} disabled={busy === z.id} onChange={() => toggle(z)} label={`${z.name} proposé aux clients`} />
                <button type="button" className="st-text-btn" onClick={() => setEditing(z.id)}>Modifier</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!zones.length && editing !== 'new' && <p className="fe-empty">Aucun quartier pour l’instant.</p>}
      {editing === 'new' ? (
        <ZoneForm onSave={save(null)} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-s fe-add" onClick={() => setEditing('new')}>+ Ajouter un quartier</button>
      )}
    </section>
  );
}

// ─── Tranches de distance ───

function BandForm({ band, onSave, onCancel }) {
  const [km, setKm] = useState(band ? String(band.upToMeters / 1000).replace('.', ',') : '');
  const [fee, setFee] = useState(feeInput(band?.fee));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const id = band?.id || 'new';
  const submit = async (e) => {
    e.preventDefault();
    const upToKm = parseKm(km);
    const amount = parseFee(fee);
    if (!(upToKm > 0)) return setError('Indiquez la distance en km (par exemple 3 ou 2,5).');
    if (!Number.isInteger(amount) || amount < 0) return setError('Indiquez le prix en F (0 pour une livraison offerte).');
    setError('');
    setSending(true);
    try {
      await onSave({ upToKm, fee: amount });
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };
  return (
    <form className="fe-form" onSubmit={submit} noValidate>
      <div className="fields">
        <div className="f">
          <label htmlFor={`fb-km-${id}`}>Jusqu’à (km)</label>
          <input id={`fb-km-${id}`} type="text" inputMode="decimal" autoComplete="off" value={km} onChange={(e) => setKm(e.target.value)} placeholder="3" autoFocus />
          <span className="hint">La tranche commence là où finit la précédente.</span>
        </div>
        <FeeField id={`fb-fee-${id}`} value={fee} onChange={setFee} />
      </div>
      {error && <p className="st-err" role="alert">{error}</p>}
      <div className="st-action-row">
        <button type="submit" className="btn btn-p" disabled={sending}>{sending ? 'Enregistrement…' : band ? 'Enregistrer' : 'Ajouter la tranche'}</button>
        <button type="button" className="st-text-btn" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function Bands({ bands, run }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [removing, setRemoving] = useState(null);
  const save = (b) => async (body) => {
    await run(() => (b ? staffApi.updateDeliveryBand(b.id, body) : staffApi.createDeliveryBand(body)), { rethrow: true });
    setEditing(null);
  };
  const toggle = async (b) => {
    setBusy(b.id);
    await run(() => staffApi.updateDeliveryBand(b.id, { isActive: !b.isActive }));
    setBusy(null);
  };
  const remove = async (b) => {
    await run(() => staffApi.deleteDeliveryBand(b.id));
    setRemoving(null);
  };
  const last = bands.filter((b) => b.isActive).at(-1);

  return (
    <section className="st-box fe-sec">
      <h2>Tranches de distance</h2>
      <p className="st-muted">
        Utilisées quand le client partage sa position GPS au lieu de choisir un quartier.
      </p>
      <div className="alert info fe-crow">
        <span>
          La distance est calculée <b>à vol d’oiseau</b> (en ligne droite) depuis le restaurant, {RESTAURANT.address}.
          Par la route, le trajet est plus long : prévoyez des tranches un peu larges.
        </span>
      </div>
      <ul className="fe-list">
        {bands.map((b) => (
          <li key={b.id} className={`fe-row${b.isActive ? '' : ' off'}`}>
            {editing === b.id ? (
              <BandForm band={b} onSave={save(b)} onCancel={() => setEditing(null)} />
            ) : removing === b.id ? (
              <div className="fe-confirm">
                <span>Supprimer la tranche jusqu’à {kmText(b.upToMeters)} ? Les commandes passées gardent leurs frais.</span>
                <button type="button" className="btn st-btn-danger" onClick={() => remove(b)}>Supprimer</button>
                <button type="button" className="st-text-btn" onClick={() => setRemoving(null)}>Annuler</button>
              </div>
            ) : (
              <>
                <span className="fe-name">
                  {b.isActive ? `De ${kmText(b.fromMeters ?? 0)} à ${kmText(b.upToMeters)}` : `Jusqu’à ${kmText(b.upToMeters)}`}
                </span>
                <b className={`fe-fee${b.fee === 0 ? ' free' : ''}`}>{feeText(b.fee)}</b>
                <Switch checked={b.isActive} disabled={busy === b.id} onChange={() => toggle(b)} label={`Tranche jusqu’à ${kmText(b.upToMeters)} utilisée`} />
                <button type="button" className="st-text-btn" onClick={() => setEditing(b.id)}>Modifier</button>
                <button type="button" className="st-text-btn danger" onClick={() => setRemoving(b.id)}>Supprimer</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {last && <p className="fe-beyond">Au-delà de {kmText(last.upToMeters)} : frais <b>à confirmer par l’agent</b> au téléphone.</p>}
      {!bands.length && editing !== 'new' && (
        <p className="fe-empty">Aucune tranche : une position partagée sans quartier choisi donne des frais à confirmer par l’agent.</p>
      )}
      {editing === 'new' ? (
        <BandForm onSave={save(null)} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-s fe-add" onClick={() => setEditing('new')}>+ Ajouter une tranche</button>
      )}
    </section>
  );
}

export default function DeliveryFeesPage() {
  const [grid, setGrid] = useState(null);
  const [error, setError] = useState(null);
  const [savingOther, setSavingOther] = useState(false);

  useEffect(() => {
    staffApi.deliveryFees().then(setGrid, setError);
  }, []);

  // Chaque action renvoie la grille à jour. rethrow : l'erreur s'affiche dans le formulaire ouvert.
  const run = async (fn, { rethrow = false } = {}) => {
    try {
      setGrid(await fn());
      setError(null);
    } catch (e) {
      if (rethrow) throw e;
      setError(e);
    }
  };

  const toggleOther = async () => {
    setSavingOther(true);
    await run(() => staffApi.setDeliverySettings({ allowOtherZone: !grid.settings.allowOtherZone }));
    setSavingOther(false);
  };

  return (
    <div className="fe">
      <div className="st-head"><h1 className="st-title">Frais de livraison</h1></div>
      <p className="st-muted fe-intro">
        Le site calcule les frais de chaque commande avec cette grille, avant que le client valide, et les copie dans la commande :
        changer un prix ne modifie jamais les commandes déjà passées. Le client paie les frais au livreur à la réception.
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!grid && !error && <p className="st-muted">Chargement…</p>}
      {grid && (
        <>
          {grid.isEmpty && (
            <div className="alert info fe-crow">
              <span><b>Grille vide.</b> Tant qu’aucun quartier ni aucune tranche n’est actif, le site fonctionne comme avant : l’équipe saisit les frais en confirmant le paiement.</span>
            </div>
          )}
          <Zones zones={grid.zones} run={run} />
          <Bands bands={grid.bands} run={run} />
          <section className="st-box fe-sec">
            <h2>Autre quartier</h2>
            <div className="fe-other">
              <p className="st-muted">
                Proposé en bas de la liste, pour un client qui ne trouve pas son quartier : la commande arrive avec des frais
                <b> à confirmer par l’agent au téléphone</b>, saisis en confirmant le paiement.
              </p>
              <Switch checked={grid.settings.allowOtherZone} disabled={savingOther} onChange={toggleOther} label="Option Autre quartier proposée" on="Proposé" off="Non proposé" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
