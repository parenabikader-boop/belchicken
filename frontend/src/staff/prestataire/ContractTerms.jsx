import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import { formatDateTime } from '../orders/labels.js';
import { dayLong } from '../statement/StatementView.jsx';
import { todayKey } from '../statement/StatementPage.jsx';

// Lot 5d : conditions du contrat de livraison avec Belchicken (page Prestataire). Gardées par versions datées :
// une version s'applique de sa date d'effet jusqu'à la suivante, ne se modifie jamais (la base le refuse) et ne
// se supprime que si elle n'a pas encore commencé. Date d'effet : aujourd'hui ou plus tard.
// Jamais montrées au Responsable livraison (l'API les lui refuse).

const KINDS = [
  { id: 'AUCUNE', label: 'Rien à payer', help: 'Période d’essai : Belchicken ne paie rien pour la livraison.' },
  { id: 'PAR_LIVRAISON', label: 'Prix par livraison', help: 'Belchicken paie un prix fixe pour chaque livraison faite par notre équipe.' },
  { id: 'FORFAIT_MENSUEL', label: 'Forfait mensuel', help: 'Belchicken paie un montant par mois, au prorata des jours pour un mois incomplet.' },
];

const EMPTY = { validFrom: '', kind: 'PAR_LIVRAISON', perDeliveryPrice: '', monthlyFee: '', freeDeliveryPrice: '0', note: '' };

export default function ContractTerms() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, validFrom: todayKey() });
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    staffApi.contractTerms().then(setData, setError);
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function run(action) {
    setSaving(true);
    try {
      setData(await action());
      setError(null);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const body = {
      validFrom: form.validFrom,
      kind: form.kind,
      perDeliveryPrice: form.kind === 'PAR_LIVRAISON' ? form.perDeliveryPrice : null,
      monthlyFee: form.kind === 'FORFAIT_MENSUEL' ? form.monthlyFee : null,
      freeDeliveryPrice: form.freeDeliveryPrice || 0,
      note: form.note.trim() || null,
    };
    if (await run(() => staffApi.createContractTerms(body))) {
      setConfirm(false);
      setForm({ ...EMPTY, validFrom: todayKey() });
    }
  }

  if (error && !data) return <div className="alert err" role="alert"><span>{error.message}</span></div>;
  if (!data) return <p className="st-muted">Chargement…</p>;
  const kind = KINDS.find((k) => k.id === form.kind);

  return (
    <section className="st-box pr-sec ct">
      <h2>Contrat avec Belchicken</h2>
      <p className="st-muted pr-intro">
        Conditions qui servent à calculer le montant dû par Belchicken sur le relevé de livraison. Pour les changer,
        ajoutez une nouvelle version avec sa date d’effet : les relevés des jours passés ne changent jamais. Le
        Responsable livraison ne voit ni ces conditions ni le montant dû ; le Patron les voit si « Relevé de
        livraison (Patron) » est ouvert.
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}

      <div className={`ct-now${data.current ? '' : ' none'}`}>
        <span>En vigueur aujourd’hui</span>
        <b>{data.current ? data.current.text : 'Aucune condition réglée : le relevé ne calcule aucun montant dû.'}</b>
        {data.current && <small>Depuis le {dayLong(data.current.validFrom)}{data.current.note && ` · ${data.current.note}`}</small>}
      </div>

      {data.versions.length > 0 && (
        <>
          <h3 className="pr-sub">Versions</h3>
          <ul className="ct-list">
            {data.versions.map((v) => (
              <li key={v.id} className="ct-row">
                <div>
                  <b>À partir du {dayLong(v.validFrom)}</b>
                  <span>{v.text}</span>
                  {v.note && <small>{v.note}</small>}
                  <small className="st-muted">Réglée par {v.createdByName}, le {formatDateTime(v.createdAt)}</small>
                </div>
                {v.canDelete && (removing === v.id ? (
                  <div className="st-action pr-confirm cancel" role="alertdialog" aria-label="Supprimer cette version">
                    <b>Supprimer cette version ?</b>
                    <p>Elle n’a pas encore commencé. La suppression est notée au journal.</p>
                    <div className="st-action-row">
                      <button type="button" className="btn st-btn-danger" disabled={saving} onClick={async () => { if (await run(() => staffApi.deleteContractTerms(v.id))) setRemoving(null); }}>Supprimer</button>
                      <button type="button" className="st-text-btn" onClick={() => setRemoving(null)}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="st-text-btn" onClick={() => setRemoving(v.id)}>Supprimer</button>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="pr-sub">Nouvelle version</h3>
      <form className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); setConfirm(true); }}>
        <div className="pr-modes" role="radiogroup" aria-label="Formule">
          {KINDS.map((k) => (
            <label key={k.id} className={`pr-mode${form.kind === k.id ? ' on' : ''}`}>
              <input type="radio" name="ct-kind" value={k.id} checked={form.kind === k.id} onChange={set('kind')} />
              <span className="pr-mode-text"><b>{k.label}</b><small>{k.help}</small></span>
            </label>
          ))}
        </div>
        <div className="fields">
          <div className="f">
            <label htmlFor="ct-from">Date d’effet</label>
            <input id="ct-from" type="date" min={todayKey()} value={form.validFrom} onChange={set('validFrom')} />
            <span className="hint">Aujourd’hui ou plus tard.</span>
          </div>
          {form.kind === 'PAR_LIVRAISON' && (
            <div className="f">
              <label htmlFor="ct-price">Prix par livraison (F)</label>
              <input id="ct-price" type="number" inputMode="numeric" min="1" step="1" value={form.perDeliveryPrice} onChange={set('perDeliveryPrice')} />
              <span className="hint">Compté pour chaque livraison, offertes comprises.</span>
            </div>
          )}
          {form.kind === 'FORFAIT_MENSUEL' && (
            <div className="f">
              <label htmlFor="ct-month">Forfait par mois (F)</label>
              <input id="ct-month" type="number" inputMode="numeric" min="1" step="1" value={form.monthlyFee} onChange={set('monthlyFee')} />
              <span className="hint">Mois incomplet : forfait × jours ÷ jours du mois.</span>
            </div>
          )}
          <div className="f">
            <label htmlFor="ct-free">Prix par livraison offerte (F)</label>
            <input id="ct-free" type="number" inputMode="numeric" min="0" step="1" value={form.freeDeliveryPrice} onChange={set('freeDeliveryPrice')} />
            <span className="hint">Payé en plus par Belchicken quand le client n’a rien payé au livreur. 0 = rien.</span>
          </div>
          <div className="f full">
            <label htmlFor="ct-note">Remarque (facultatif)</label>
            <input id="ct-note" type="text" maxLength={200} placeholder="Ex. Contrat signé le …" value={form.note} onChange={set('note')} />
          </div>
        </div>
        {confirm ? (
          <div className="st-action pr-confirm" role="alertdialog" aria-label="Confirmer la nouvelle version">
            <b>Ajouter cette version à partir du {form.validFrom ? dayLong(form.validFrom) : '…'} ?</b>
            <p>
              {kind.label}
              {form.kind === 'PAR_LIVRAISON' && form.perDeliveryPrice && ` : ${formatPrice(Number(form.perDeliveryPrice))}`}
              {form.kind === 'FORFAIT_MENSUEL' && form.monthlyFee && ` : ${formatPrice(Number(form.monthlyFee))} par mois`}
              {Number(form.freeDeliveryPrice) > 0 && ` · livraison offerte : ${formatPrice(Number(form.freeDeliveryPrice))}`}.
              {' '}Une fois commencée, elle ne pourra plus être modifiée ni supprimée. Noté au journal.
            </p>
            <div className="st-action-row">
              <button type="button" className="btn btn-p" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
              <button type="button" className="st-text-btn" onClick={() => setConfirm(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className="st-action-row">
            <button type="submit" className="btn btn-p">Ajouter cette version</button>
          </div>
        )}
      </form>
    </section>
  );
}
