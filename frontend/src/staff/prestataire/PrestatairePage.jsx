import { useCallback, useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';
import { formatDateTime } from '../orders/labels.js';

// Lot 4 : page Prestataire (/equipe/prestataire, Prestataire seulement).
// Interrupteurs des fonctions incluses dans la formule (confirmation avant chaque changement) et journal de
// sécurité en lecture seule. Fermer ne supprime rien : la fonction est seulement cachée et refusée par l'API.

const TYPE_LABEL = {
  CONNEXION: 'Connexion',
  CONNEXION_ECHEC: 'Connexion ratée',
  COMPTE_BLOQUE: 'Compte bloqué',
  CODE_SECOURS_UTILISE: 'Code de secours utilisé',
  INTERRUPTEUR: 'Fonction',
  SCRIPT: 'Script (ordinateur)',
};

// Navigateur lisible : « Chrome sur Android », sinon le début du texte
function device(ua) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  return browser && os ? `${browser} sur ${os}` : ua.slice(0, 40);
}

function Features() {
  const { setFeatures } = useStaff();
  const [features, setList] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // fonction dont le changement attend la confirmation
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    staffApi.features().then(setList, setError);
  }, []);

  const apply = async () => {
    setSaving(true);
    try {
      const list = await staffApi.setFeature(confirm.key, !confirm.enabled);
      setList(list);
      setFeatures(list);
      setError(null);
      setConfirm(null);
    } catch (e) {
      setError(e);
    }
    setSaving(false);
  };

  if (error && !features) return <div className="alert err" role="alert"><span>{error.message}</span></div>;
  if (!features) return <p className="st-muted">Chargement…</p>;
  return (
    <section className="st-box pr-sec">
      <h2>Fonctions incluses dans la formule</h2>
      <p className="st-muted pr-intro">
        Fermée, une fonction disparaît de l’espace équipe pour tout le monde, vous compris, avec le message « Fonction
        non incluse dans votre formule, contactez votre prestataire ». Aucune donnée n’est supprimée.
      </p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      <ul className="pr-list">
        {features.map((f) => (
          <li key={f.key} className={`pr-row${f.enabled ? '' : ' off'}`}>
            <div className="pr-text">
              <b>{f.label}</b>
              <small>{f.help}</small>
              {f.updatedByName && <small className="pr-who">Changé par {f.updatedByName}, le {formatDateTime(f.updatedAt)}</small>}
            </div>
            <label className="mn-switch">
              <input
                type="checkbox" role="switch" checked={f.enabled} disabled={saving}
                onChange={() => setConfirm(f)} aria-label={f.label}
              />
              <span className="mn-track" aria-hidden="true" />
              <span className="mn-state">{f.enabled ? 'Ouverte' : 'Fermée'}</span>
            </label>
            {confirm?.key === f.key && (
              <div className={`st-action pr-confirm${f.enabled ? ' cancel' : ''}`} role="alertdialog" aria-label={`Confirmer : ${f.label}`}>
                <b>{f.enabled ? `Fermer « ${f.label} » ?` : `Rouvrir « ${f.label} » ?`}</b>
                <p>
                  {f.enabled
                    ? 'La fonction disparaît tout de suite pour toute l’équipe. Aucune donnée n’est supprimée. Ce changement est noté au journal.'
                    : 'La fonction revient tout de suite, avec toutes ses données. Ce changement est noté au journal.'}
                </p>
                <div className="st-action-row">
                  <button type="button" className={`btn ${f.enabled ? 'st-btn-danger' : 'btn-p'}`} disabled={saving} onClick={apply}>
                    {saving ? 'Un instant…' : f.enabled ? 'Fermer' : 'Rouvrir'}
                  </button>
                  <button type="button" className="st-text-btn" onClick={() => setConfirm(null)}>Annuler</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Journal() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { features } = useStaff();

  const load = useCallback(() => {
    staffApi.securityLog(page).then((d) => { setData(d); setError(null); }, setError);
  }, [page]);
  // Rechargé aussi après un changement d'interrupteur (features change)
  useEffect(load, [load, features]);

  return (
    <section className="st-box pr-sec">
      <h2>Journal de sécurité</h2>
      <p className="st-muted pr-intro">Connexions, essais ratés, blocages, codes de secours, scripts et changements de fonctions. Il ne peut être ni modifié ni effacé.</p>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!data && !error && <p className="st-muted">Chargement…</p>}
      {data && data.entries.length === 0 && <p className="st-muted">Rien pour l’instant.</p>}
      {data && data.entries.length > 0 && (
        <ol className="pr-log">
          {data.entries.map((e) => (
            <li key={e.id} className={`pr-entry t-${e.type}`}>
              <div className="pr-entry-top">
                <span className="pr-type">{TYPE_LABEL[e.type] || e.type}</span>
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </div>
              <p>
                {e.type === 'INTERRUPTEUR'
                  ? <><b>{e.featureLabel}</b> : {e.before ? 'ouverte' : 'fermée'} → <b>{e.after ? 'ouverte' : 'fermée'}</b></>
                  : e.detail}
              </p>
              <small className="st-muted">
                {[e.actorName, e.ip && `IP ${e.ip}`, device(e.userAgent)].filter(Boolean).join(' · ')}
              </small>
            </li>
          ))}
        </ol>
      )}
      {data && data.pages > 1 && (
        <div className="pr-pages">
          <button type="button" className="btn btn-s" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Plus récents</button>
          <span className="st-muted">Page {data.page} sur {data.pages}</span>
          <button type="button" className="btn btn-s" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Plus anciens ›</button>
        </div>
      )}
    </section>
  );
}

export default function PrestatairePage() {
  return (
    <div className="pr">
      <div className="st-head"><h1 className="st-title">Prestataire</h1></div>
      <Features />
      <Journal />
    </div>
  );
}
