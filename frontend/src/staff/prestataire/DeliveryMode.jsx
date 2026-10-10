import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatDateTime } from '../orders/labels.js';

// Lot 5 : mode de livraison, réglé par le Prestataire (page Prestataire).
// Restaurant (par défaut) = fonctionnement d'avant. Prestataire = notre équipe de livreurs, frais payés sur
// nos codes marchands. Le mode Prestataire ne s'active qu'avec la société, le nom affiché et les 3 codes.
// Le mode est noté sur chaque commande à sa création : changer de mode ne touche pas les commandes passées.

const MODES = {
  RESTAURANT: {
    label: 'Restaurant',
    help: 'Les livreurs du restaurant. Frais de livraison payés sur les codes marchands du restaurant (ECOFOOD). Fonctionnement d’avant.',
  },
  PRESTATAIRE: {
    label: 'Prestataire',
    help: 'Notre équipe de livreurs. Frais de livraison payés sur nos codes marchands, avec notre nom affiché. Le paiement des plats ne change pas.',
  },
};

const CODE_FIELDS = [
  { key: 'orangeCode', label: 'Code Orange Money', example: '*144*10*12345678*MONTANT#' },
  { key: 'moovCode', label: 'Code Moov Money', example: '*555*4*1*1234567*MONTANT#' },
  { key: 'telecelCode', label: 'Code Telecel Money', example: '*808*4*1*1234567*MONTANT#' },
];

const toForm = (c) => ({
  companyName: c.companyName || '', merchantName: c.merchantName || '',
  orangeCode: c.orangeCode || '', moovCode: c.moovCode || '', telecelCode: c.telecelCode || '',
});

export default function DeliveryMode() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // mode qui attend la confirmation

  const load = (d) => {
    setData(d);
    setForm(toForm(d.company));
  };
  useEffect(() => {
    staffApi.deliveryCompany().then(load, setError);
  }, []);

  const save = async (body, after) => {
    setSaving(true);
    setSaved(false);
    try {
      load(await staffApi.setDeliveryCompany(body));
      setError(null);
      after?.();
    } catch (e) {
      setError(e);
    }
    setSaving(false);
  };

  if (error && !data) return <div className="alert err" role="alert"><span>{error.message}</span></div>;
  if (!data) return <p className="st-muted">Chargement…</p>;

  const mode = data.company.mode;
  const changed = Object.entries(toForm(data.company)).some(([k, v]) => form[k] !== v);
  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setSaved(false); };

  return (
    <section className="st-box pr-sec">
      <h2>Mode de livraison</h2>
      <p className="st-muted pr-intro">
        Le mode est noté sur chaque commande au moment où elle est passée : le changer ne touche pas les commandes déjà
        passées. Les commandes à emporter ne sont pas concernées. Chaque changement est noté au journal.
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}

      <div className="pr-modes" role="radiogroup" aria-label="Mode de livraison">
        {Object.entries(MODES).map(([key, m]) => {
          const locked = key === 'PRESTATAIRE' && !data.ready;
          return (
            <label key={key} className={`pr-mode${mode === key ? ' on' : ''}${locked ? ' locked' : ''}`}>
              <input
                type="radio" name="delivery-mode" value={key} checked={mode === key} disabled={saving || locked}
                onChange={() => setConfirm(key)}
              />
              <span className="pr-mode-text">
                <b>{m.label}{mode === key && <span className="pr-mode-now"> · actif</span>}</b>
                <small>{m.help}</small>
                {locked && <small className="pr-mode-missing">Impossible pour l’instant : il manque {joinFr(data.missing)}.</small>}
              </span>
            </label>
          );
        })}
      </div>

      {confirm && (
        <div className={`st-action pr-confirm${confirm === 'RESTAURANT' ? ' cancel' : ''}`} role="alertdialog" aria-label="Confirmer le mode de livraison">
          <b>Passer en mode {MODES[confirm].label} ?</b>
          <p>
            {confirm === 'PRESTATAIRE'
              ? `Les nouvelles commandes en livraison seront livrées par notre équipe, et leurs frais payés sur nos codes (nom affiché : ${data.company.merchantName}). Les commandes déjà passées ne changent pas.`
              : 'Les nouvelles commandes en livraison reviennent au restaurant (codes ECOFOOD). Les commandes déjà passées en mode Prestataire gardent nos codes jusqu’au bout.'}
          </p>
          <div className="st-action-row">
            <button type="button" className="btn btn-p" disabled={saving} onClick={() => save({ mode: confirm }, () => setConfirm(null))}>
              {saving ? 'Un instant…' : `Passer en mode ${MODES[confirm].label}`}
            </button>
            <button type="button" className="st-text-btn" onClick={() => setConfirm(null)}>Annuler</button>
          </div>
        </div>
      )}

      {data.awaitingFees > 0 && (
        <p className="st-note">
          {data.awaitingFees > 1
            ? `${data.awaitingFees} commandes en mode Prestataire attendent encore leurs frais`
            : '1 commande en mode Prestataire attend encore ses frais'}
          {' '}: nos codes et notre nom ne peuvent pas être vidés.
        </p>
      )}

      <h3 className="pr-sub">Notre société</h3>
      <form
        className="pr-company"
        noValidate
        onSubmit={(e) => { e.preventDefault(); save(form, () => setSaved(true)); }}
      >
        <div className="fields">
          <div className="f">
            <label htmlFor="dc-company">Nom de la société</label>
            <input id="dc-company" type="text" autoComplete="off" maxLength={80} value={form.companyName} onChange={set('companyName')} />
          </div>
          <div className="f">
            <label htmlFor="dc-merchant">Nom affiché au client</label>
            <input id="dc-merchant" type="text" autoComplete="off" maxLength={80} value={form.merchantName} onChange={set('merchantName')} />
            <span className="hint">Le nom que le client voit sur sa confirmation de paiement.</span>
          </div>
          {CODE_FIELDS.map((f) => (
            <div className="f" key={f.key}>
              <label htmlFor={`dc-${f.key}`}>{f.label}</label>
              <input
                id={`dc-${f.key}`} type="text" inputMode="tel" autoComplete="off" spellCheck="false" value={form[f.key]}
                onChange={set(f.key)} placeholder={f.example}
              />
              <span className="hint">Avec MONTANT à la place du montant, terminé par #.</span>
            </div>
          ))}
        </div>
        <div className="st-action-row">
          <button type="submit" className="btn btn-p" disabled={saving || !changed}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          {saved && !changed && <span className="pr-saved" role="status">Enregistré.</span>}
        </div>
        {data.updatedByName && <small className="st-muted pr-who">Changé par {data.updatedByName}, le {formatDateTime(data.updatedAt)}</small>}
      </form>
    </section>
  );
}

// « a », « a et b », « a, b et c »
function joinFr(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
}
