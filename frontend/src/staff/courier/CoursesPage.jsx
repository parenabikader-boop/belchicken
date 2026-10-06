import { useCallback, useEffect, useRef, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { useStaff } from '../StaffContext.jsx';
import { useChime } from '../orders/OrdersFeed.jsx';
import AlertsPrompt from '../alerts/AlertsPrompt.jsx';
import { FEE_METHOD_LABEL, formatPhone, formatTime, telHref, whatsappHref } from '../orders/labels.js';
import { FeeMethodPicker } from '../orders/OrderSteps.jsx';
import { formatPrice } from '../../utils/format.js';

// /equipe/courses : le livreur ne voit que ses courses du jour (l'API ne lui donne rien d'autre).
// Seul montant affiché : les frais de livraison à encaisser (le client a payé les plats d'avance). Pour remettre
// la commande, le livreur tape le code à 4 chiffres reçu par le client sur WhatsApp et note comment les frais ont été payés.

const POLL_VISIBLE_MS = 10000;
const POLL_HIDDEN_MS = 30000;

export default function CoursesPage() {
  const { retry: recheckSession } = useStaff();
  const { play, soundReady } = useChime();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState(null);
  const known = useRef(null); // références déjà vues : une nouvelle course sonne
  const [success, setSuccess] = useState(null); // course qui vient d'être remise

  const load = useCallback(async () => {
    try {
      const { courses: list } = await staffApi.courses();
      const active = list.filter((c) => c.status === 'EN_LIVRAISON').map((c) => c.reference);
      if (known.current && active.some((r) => !known.current.has(r))) play();
      known.current = new Set(active);
      setCourses(list);
      setError(null);
    } catch (e) {
      if (e.status === 401 || e.status === 403) recheckSession();
      else setError(e);
    }
  }, [play, recheckSession]);

  useEffect(() => {
    let timer;
    const tick = async () => {
      await load();
      timer = setTimeout(tick, document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
    };
    tick();
    const onShow = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load]);

  const replace = (course) => setCourses((list) => list.map((c) => (c.reference === course.reference ? course : c)));
  const delivered = (course) => {
    replace(course);
    setSuccess(course);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!courses) {
    return error ? <div className="alert err" role="alert"><span>{error.message}</span></div> : <p className="st-muted">Chargement de vos courses…</p>;
  }

  const active = courses.filter((c) => c.status === 'EN_LIVRAISON');
  const done = courses.filter((c) => c.status !== 'EN_LIVRAISON');

  return (
    <div className="lv">
      <div className="st-head">
        <h1 className="st-title">Mes courses</h1>
        <span className="st-muted">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
      <AlertsPrompt what="course" />
      {!soundReady && active.length === 0 && <p className="st-muted lv-sound">Touchez l’écran une fois : un son vous prévient de chaque nouvelle course.</p>}
      {error && <div className="alert err" role="alert" style={{ marginBottom: 12 }}><span>{error.message}</span></div>}
      {success && (
        <div className="lv-success" role="status">
          <span className="lv-success-icon" aria-hidden="true">✓</span>
          <div>
            <b>Livraison validée</b>
            <p>Commande {success.reference} remise à {success.customerName}{success.deliveredAt && ` à ${formatTime(success.deliveredAt)}`}. L’équipe est prévenue. Merci !</p>
            {success.feeMethod && (
              <p className="lv-success-fee">
                Frais : <b>{formatPrice(success.deliveryFee)} {FEE_METHOD_LABEL[success.feeMethod]}</b>
                {success.feeMethod === 'ESPECES' ? ', à remettre au restaurant.' : ', l’équipe vérifie sur le téléphone marchand.'}
              </p>
            )}
          </div>
          <button type="button" className="lv-success-x" onClick={() => setSuccess(null)} aria-label="Fermer">×</button>
        </div>
      )}

      {active.length === 0 ? (
        <div className="st-empty">
          <b>Aucune course en cours</b>
          <p>Vos nouvelles courses s’affichent ici dès que l’équipe vous les assigne.</p>
        </div>
      ) : (
        <>
          <p className="lv-count">{active.length} course{active.length > 1 ? 's' : ''} à livrer</p>
          {active.map((c) => <Course key={c.reference} course={c} onDelivered={delivered} onRefresh={load} />)}
        </>
      )}

      {done.length > 0 && (
        <section className="lv-done">
          <h2>Aujourd’hui</h2>
          <ul>
            {done.map((c) => (
              <li key={c.reference} className={c.status === 'ANNULEE' ? 'cancel' : ''}>
                <span><b>{c.reference}</b> · {c.customerName}</span>
                {c.status === 'ANNULEE' ? (
                  <em>Annulée : ne pas livrer</em>
                ) : (
                  <em>
                    Livrée{c.deliveredAt && ` à ${formatTime(c.deliveredAt)}`}
                    {c.feeMethod && ` · ${formatPrice(c.deliveryFee)} ${FEE_METHOD_LABEL[c.feeMethod]}`}
                  </em>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Course({ course: c, onDelivered, onRefresh }) {
  return (
    <article className="lv-card">
      <header className="lv-top">
        <b>{c.reference}</b>
        <span className="st-muted">Assignée à {formatTime(c.assignedAt)}</span>
      </header>

      {/* Frais de livraison : le seul montant que le livreur voit */}
      {c.feePaidBefore ? (
        <p className="lv-fee paid"><span>Frais déjà payés</span><small>Rien à encaisser pour cette course.</small></p>
      ) : c.deliveryFee != null && (
        <p className="lv-fee">
          <span>Frais à encaisser : <b>{formatPrice(c.deliveryFee)}</b></span>
          <small>En espèces, ou par Orange Money / Moov Money / Telecel Money avec le code marchand, au choix du client.</small>
        </p>
      )}

      <section className="lv-sec">
        <p className="lv-name">{c.customerName}</p>
        <p className="st-phone">{formatPhone(c.customerPhone)}</p>
        <div className="lv-row">
          <a className="btn lv-call" href={telHref(c.customerPhone)}>Appeler</a>
          <a className="btn btn-wa" href={whatsappHref(c.customerPhone)} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </section>

      <section className="lv-sec">
        <h3>Adresse et repères</h3>
        <p>{c.addressNote || <span className="st-muted">Aucun repère : appelez le client.</span>}</p>
        {c.directionsUrl ? (
          <a className="btn btn-s btn-block lv-maps" href={c.directionsUrl} target="_blank" rel="noreferrer">
            Itinéraire Google Maps
            {c.location?.accuracy != null && <small>position à environ {c.location.accuracy} m près</small>}
          </a>
        ) : (
          <p className="lv-warn">Position non partagée par le client : appelez-le pour trouver l’adresse.</p>
        )}
      </section>

      <section className="lv-sec">
        <h3>À remettre</h3>
        <ul className="lv-items">
          {c.items.map((i, k) => {
            const details = [i.variantLabel, i.choice].filter(Boolean).join(' · ');
            return (
              <li key={k}>
                <span className="st-qty">{i.quantity} ×</span>
                <span>
                  <b>{i.productNumber != null && `N° ${i.productNumber} · `}{i.productName}</b>
                  {details && <small>{details}</small>}
                  {i.note && <em>Note : {i.note}</em>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <Handover course={c} onDelivered={onDelivered} onRefresh={onRefresh} />
    </article>
  );
}

// Remise : le livreur tape le code que le client lui donne, et indique comment les frais ont été payés
// (les deux sont obligatoires ; l'API vérifie aussi)
function Handover({ course: c, onDelivered, onRefresh }) {
  const [code, setCode] = useState('');
  const [feeMethod, setFeeMethod] = useState('');
  const needMethod = !c.feePaidBefore;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (c.locked || !c.hasCode) {
    return (
      <section className="lv-code locked">
        <b>{c.locked ? 'Trop de codes faux' : 'Pas de code pour cette commande'}</b>
        <p>Appelez l’équipe : elle validera la livraison à votre place.</p>
      </section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDelivered(await staffApi.deliver(c.reference, code, needMethod ? feeMethod : undefined));
    } catch (err) {
      setError(err.message);
      setCode('');
      onRefresh(); // essais restants à jour, ou course annulée entre-temps
    }
    setBusy(false);
  };

  return (
    <form className="lv-code" onSubmit={submit}>
      {needMethod && <FeeMethodPicker fee={c.deliveryFee} value={feeMethod} onChange={setFeeMethod} big />}
      <label htmlFor={`code-${c.reference}`}><b>Code du client</b></label>
      <p className="st-muted">Le client a reçu ce code à 4 chiffres sur WhatsApp. Demandez-le au moment de remettre la commande.</p>
      <div className="lv-code-row">
        <input
          id={`code-${c.reference}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          placeholder="• • • •"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        <button type="submit" className="btn btn-p" disabled={busy || code.length !== 4 || (needMethod && !feeMethod)}>{busy ? 'Vérification…' : 'Valider la livraison'}</button>
      </div>
      {error && <p className="st-err" role="alert">{error}</p>}
    </form>
  );
}
