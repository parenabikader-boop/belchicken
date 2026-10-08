import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { TunnelHead } from '../components/PageParts.jsx';
import { DIRECTIONS_URL, HOURS, RESTAURANT } from '../restaurant.js';
import PayCode from '../components/PayCode.jsx';
import { useCart, useCartDetails } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { formatPrice, plural } from '../utils/format.js';
import { fillCode, MOBILE_MONEY, usePaymentCodes } from '../utils/payment.js';

const DRAFT_KEY = 'belchicken.infos.v1';
const EMPTY = { name: '', phone: '', method: null, payer: '', mode: 'LIVRAISON', addr: '', geo: null };

// Livraison à domicile, ou à emporter (retrait au restaurant, sans frais de livraison)
const MODES = [
  { id: 'LIVRAISON', label: 'Livraison', sub: 'Chez vous ou au bureau, frais selon le quartier' },
  { id: 'A_EMPORTER', label: 'À emporter', sub: 'Vous retirez la commande au restaurant, sans frais' },
];

const METHODS = MOBILE_MONEY;

// Mesure de la position : on écoute le GPS pendant GEO_WINDOW ms et on garde la mesure la plus
// précise, en s'arrêtant plus tôt si elle descend sous GEO_GOOD mètres.
const GEO_WINDOW = 8000;
const GEO_GOOD = 10;

// Champ de l'API (details[].path) -> champ du formulaire
const API_FIELDS = {
  'customer.name': 'name',
  'customer.phone': 'phone',
  'payment.payerPhone': 'payer',
  addressNote: 'addr',
};

// Brouillon gardé le temps de la visite, pour ne pas tout retaper après un retour à Ma commande
function readDraft() {
  try {
    const draft = { ...EMPTY, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY)) };
    // Un brouillon d'avant la suppression des espèces peut encore contenir ESPECES
    if (!METHODS.some((m) => m.id === draft.method)) draft.method = null;
    if (!MODES.some((m) => m.id === draft.mode)) draft.mode = 'LIVRAISON';
    return draft;
  } catch {
    return EMPTY;
  }
}
function saveDraft(form) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    /* stockage indisponible : le formulaire reste en mémoire */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* rien à faire */
  }
}

// Mêmes règles que le serveur (backend/src/utils/phone.js), pour prévenir avant l'envoi
function isPhone(value) {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) return true;
  if (digits.length === 11 && digits.startsWith('226')) return true;
  return intl && !digits.startsWith('226') && digits.length >= 10 && digits.length <= 15;
}

function validate(f) {
  const fields = {};
  const summary = [];
  const fail = (key, msg, short) => {
    if (key) fields[key] = msg;
    summary.push(short || msg);
  };
  if (f.name.trim().length < 2) fail('name', 'Indiquez votre nom complet.');
  if (!isPhone(f.phone)) fail('phone', 'Indiquez un numéro WhatsApp valide.');
  if (!f.method) fail('method', 'Choisissez votre opérateur mobile money.', 'Choisissez le moyen de paiement.');
  {
    if (!isPhone(f.payer)) fail('payer', 'Indiquez le numéro ayant payé.');
  }
  if (f.mode === 'LIVRAISON' && !f.geo && f.addr.trim().length < 5) {
    fields.geo = 'Partagez votre position ou indiquez votre quartier et un repère.';
    fail('addr', 'Indiquez au moins un quartier et un repère.', 'Indiquez votre lieu de livraison.');
  }
  return { fields, summary };
}

function Field({ id, label, required, hint, error, full, children }) {
  return (
    <div className={`f${full ? ' full' : ''}${error ? ' bad' : ''}`}>
      <label htmlFor={id}>{label}{required && <> <i>*</i></>}</label>
      {hint && <span className="hint">{hint}</span>}
      {children}
      <span className="err" id={`${id}-err`}>{error}</span>
    </div>
  );
}

const PinIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

// Après le choix de l'opérateur : le code marchand avec le montant des plats déjà rempli
function PayStep({ method, total, payment }) {
  if (!method) {
    return <p className="pay-hint">Choisissez votre opérateur : le code de paiement s’affiche avec le montant déjà rempli.</p>;
  }
  if (payment.error) {
    return (
      <div className="alert err pay-how" role="alert">
        <span>Le code de paiement n’a pas pu être chargé. <button type="button" className="lnk" onClick={payment.retry}>Réessayer</button></span>
      </div>
    );
  }
  if (!payment.data) return <p className="pay-hint">Chargement du code de paiement…</p>;
  const op = payment.data.operators.find((o) => o.method === method);
  return (
    <div className="pay-step">
      <p className="pay-step-t">Payez <b>{formatPrice(total)}</b> par {op.label} avec ce code&nbsp;:</p>
      <PayCode code={fillCode(op.code, total)} />
      <div className="alert info pay-how">
        <span>
          Votre confirmation affichera le nom <b>{payment.data.merchantName}</b> : c’est bien le compte de Belchicken. Paiement sans frais.
          Une fois payé, indiquez ci-dessous le numéro qui a payé : votre commande est préparée dès que le paiement est vérifié.
        </span>
      </div>
    </div>
  );
}

export default function Valider() {
  const navigate = useNavigate();
  const { lines } = useCart();
  const { items, total, ready } = useCartDetails();
  const { status, error: menuError, reload } = useMenu();
  const payment = usePaymentCodes();
  const [form, setForm] = useState(readDraft);
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [geoState, setGeoState] = useState(null); // null | 'searching' | 'denied' | 'unsupported'
  const watchRef = useRef(null);
  const [sending, setSending] = useState(false);
  // Envoi long (base qui se réveille, réseau lent) : on rassure le client au lieu de le laisser douter
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!sending) return undefined;
    const timer = setTimeout(() => setSlow(true), 2500);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [sending]);
  const alertRef = useRef(null);

  useEffect(() => saveDraft(form), [form]);

  useEffect(() => {
    if (alert) alertRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [alert]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key] && !(key === 'addr' && e.geo)) return e;
      const { [key]: _, ...rest } = e;
      if (key === 'addr') delete rest.geo;
      return rest;
    });
  };
  const input = (key) => ({
    id: `c-${key}`,
    value: form[key],
    onChange: (e) => set(key, e.target.value),
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `c-${key}-err` : undefined,
  });

  const stopWatch = () => {
    if (!watchRef.current) return;
    navigator.geolocation.clearWatch(watchRef.current.id);
    clearTimeout(watchRef.current.timer);
    watchRef.current = null;
  };
  useEffect(() => stopWatch, []);

  const locate = () => {
    setErrors(({ geo: _, ...rest }) => rest);
    if (!navigator.geolocation) return setGeoState('unsupported');
    stopWatch();
    setGeoState('searching');
    let best = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stopWatch();
      if (!best) return setGeoState('denied');
      setGeoState(null);
      set('geo', {
        latitude: +best.latitude.toFixed(6),
        longitude: +best.longitude.toFixed(6),
        accuracy: Math.round(best.accuracy),
      });
    };
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!best || coords.accuracy < best.accuracy) {
          best = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
        }
        if (best.accuracy <= GEO_GOOD) finish();
      },
      // Refus : inutile d'attendre. Les autres erreurs (délai, signal) laissent la fenêtre se terminer.
      (err) => err.code === err.PERMISSION_DENIED && finish(),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    watchRef.current = { id, timer: setTimeout(finish, GEO_WINDOW) };
  };

  const blocked = items.some((i) => i.problem);
  const delivery = form.mode === 'LIVRAISON';

  const submit = async () => {
    if (sending) return;
    const { fields, summary } = validate(form);
    setErrors(fields);
    if (summary.length) {
      setAlert(`${plural(summary.length, 'information')} à compléter : ${summary.join(' ')}`);
      return;
    }
    const payload = {
      customer: { name: form.name.trim(), phone: form.phone.trim() },
      payment: { method: form.method, payerPhone: form.payer.trim() },
      mode: form.mode,
      ...(delivery && form.geo && {
        location: { latitude: form.geo.latitude, longitude: form.geo.longitude, accuracy: form.geo.accuracy },
      }),
      ...(delivery && form.addr.trim() && { addressNote: form.addr.trim() }),
      // Jamais de prix : le serveur les recalcule
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        ...(l.choice && { choice: l.choice }),
        ...(l.note && { note: l.note }),
        // Boissons choisies dans la formule (le serveur vérifie le nombre et la disponibilité)
        ...(l.drinks?.length && { drinks: l.drinks.map((d) => ({ productId: d.productId, quantity: d.quantity })) }),
      })),
    };

    setAlert('');
    setSending(true);
    try {
      const order = await api.createOrder(payload);
      // Infos non renvoyées par GET /api/orders/:reference, utiles à la page de confirmation
      const recap = {
        name: payload.customer.name,
        phone: payload.customer.phone,
        method: form.method,
        payer: payload.payment.payerPhone,
        mode: form.mode,
        geo: delivery && !!form.geo,
        addr: payload.addressNote || '',
      };
      // Le panier est vidé par la page de confirmation : le vider ici ferait d'abord revenir
      // cette page, panier vide, sur Ma commande
      clearDraft();
      navigate(`/confirmation/${order.reference}`, { replace: true, state: { order, recap } });
    } catch (err) {
      setSending(false);
      const fieldErrors = {};
      for (const d of err.details || []) {
        const key = API_FIELDS[d.path] || (d.path?.startsWith('location') ? 'geo' : null);
        if (key && !fieldErrors[key]) fieldErrors[key] = d.message;
      }
      // Un plat est passé indisponible entre-temps : on recharge le menu pour le griser
      if (err.code === 'PRODUIT_INDISPONIBLE') reload();
      setErrors(fieldErrors);
      setAlert(err.message);
    }
  };

  if (status === 'error') {
    return (
      <div className="wrap pagebody tunnel-body">
        <TunnelHead title="Vos informations" />
        <div className="empty-page">
          <h2>Menu indisponible</h2><p>{menuError.message}</p>
          <button className="btn btn-p" onClick={reload}>Réessayer</button>
        </div>
      </div>
    );
  }
  if (ready && !items.length) return <Navigate to="/commande" replace />;

  let geoTitle = 'Partager ma position';
  let geoSub = 'Recommandé : le livreur arrive directement chez vous.';
  if (geoState === 'searching') geoTitle = 'Recherche de votre position…';
  else if (geoState === 'denied') [geoTitle, geoSub] = ['Position non disponible', 'Autorisez la localisation, ou indiquez vos repères ci-dessous.'];
  else if (geoState === 'unsupported') geoSub = 'Partage indisponible. Indiquez vos repères ci-dessous.';
  else if (form.geo) [geoTitle, geoSub] = ['Position partagée', `Précision d'environ ${form.geo.accuracy} m`];

  return (
    <>
      <div className="wrap pagebody tunnel-body" style={{ maxWidth: 1160 }}>
        <TunnelHead title="Vos informations" step={2}>
          Les champs marqués d'un astérisque <i className="req-star">*</i> sont obligatoires.
        </TunnelHead>
        {alert && <div className="alert err" role="alert" ref={alertRef}><span>{alert}</span></div>}

        {!ready ? (
          <div className="empty-page"><p>Chargement de votre commande…</p></div>
        ) : (
          <form className="co" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div>
              <section className="box">
                <div className="box-h"><span className="n">1</span><h2>Coordonnées</h2></div>
                <div className="box-b"><div className="fields">
                  <Field id="c-name" label="Nom complet" required error={errors.name}>
                    <input {...input('name')} autoComplete="name" placeholder="Awa Ouédraogo" maxLength={80} />
                  </Field>
                  <Field id="c-phone" label="Numéro WhatsApp" required error={errors.phone}>
                    <input {...input('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+226 76 12 34 56" />
                  </Field>
                </div></div>
              </section>

              <section className="box">
                <div className="box-h"><span className="n">2</span><h2>Paiement</h2></div>
                <div className="box-b">
                  <fieldset>
                    <legend>Votre opérateur <i style={{ color: 'var(--bad)', fontStyle: 'normal' }}>*</i></legend>
                    <div className="methods" role="radiogroup">
                      {METHODS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={form.method === m.id}
                          className={`opt${form.method === m.id ? ' on' : ''}`}
                          onClick={() => set('method', m.id)}
                        >
                          <span className={m.cls}>{m.logo}</span>
                          <span className="l"><b>{m.label}</b><small>Code marchand</small></span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {errors.method && <p className="err-line">{errors.method}</p>}
                  <PayStep method={form.method} total={total} payment={payment} />
                  <div className="fields" style={{ marginTop: 16 }}>
                    <Field id="c-payer" label="Numéro ayant payé" required error={errors.payer}>
                      <input {...input('payer')} type="tel" inputMode="tel" placeholder="+226 76 12 34 56" />
                    </Field>
                  </div>
                </div>
              </section>

              <section className="box">
                <div className="box-h"><span className="n">3</span><h2>Livraison ou à emporter</h2></div>
                <div className="box-b">
                  <div className="methods modes" role="radiogroup" aria-label="Livraison ou à emporter">
                    {MODES.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={form.mode === m.id} className={`opt${form.mode === m.id ? ' on' : ''}`} onClick={() => set('mode', m.id)}>
                        <span className="rd" aria-hidden="true" />
                        <span className="l"><b>{m.label}</b><small>{m.sub}</small></span>
                      </button>
                    ))}
                  </div>
                  {delivery ? (
                    <>
                      <div className={`geo${form.geo && !geoState ? ' ok' : ''}`} style={{ marginTop: 16 }}>
                        <div className="ic"><PinIcon /></div>
                        <div style={{ flex: 1 }} aria-live="polite"><b>{geoTitle}</b><span>{geoSub}</span></div>
                        <button type="button" className="btn btn-s" style={{ padding: '9px 16px' }} onClick={locate} disabled={geoState === 'searching'}>
                          {form.geo ? 'Actualiser' : 'Partager'}
                        </button>
                      </div>
                      {errors.geo && <p className="err-line">{errors.geo}</p>}
                      <div className="fields" style={{ marginTop: 16 }}>
                        <Field id="c-addr" label="Quartier et points de repère" hint="Obligatoire si vous ne partagez pas votre position" error={errors.addr} full>
                          <textarea {...input('addr')} placeholder="Patte d’Oie, portail bleu après la pharmacie" maxLength={300} />
                        </Field>
                      </div>
                    </>
                  ) : (
                    <div className="pickup">
                      <div className="ic"><PinIcon /></div>
                      <div className="pickup-t">
                        <b>{RESTAURANT.name}</b>
                        <span>{RESTAURANT.address}, {RESTAURANT.city}</span>
                        <small>{HOURS.map((h) => `${h.days} : ${h.time}`).join(' · ')}</small>
                        <small>Nous vous écrivons sur WhatsApp dès que votre commande est prête.</small>
                      </div>
                      <a className="btn btn-s" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">Itinéraire</a>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="box sum">
              <div className="box-h"><h2>Votre commande</h2></div>
              <div className="box-b">
                <table><tbody>
                  {items.map((i) => (
                    <tr key={i.key}>
                      <td>{i.quantity} × {i.product.name}{i.options && <small>{i.options}</small>}</td>
                      <td>{formatPrice(i.amount)}</td>
                    </tr>
                  ))}
                  <tr className="tot"><td>Total des plats</td><td>{formatPrice(total)}</td></tr>
                </tbody></table>
                {delivery ? (
                  <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>Frais de livraison selon votre quartier : indiqués après la vérification de votre paiement, sur WhatsApp et sur la page de suivi. Vous les payez au livreur à la réception, en espèces ou par mobile money avec le code marchand.</p>
                ) : (
                  <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>À emporter : pas de frais de livraison. Vous retirez votre commande au restaurant, {RESTAURANT.address}.</p>
                )}
                {blocked && <p className="err-line" style={{ marginTop: 12 }}>Un plat n'est plus disponible. Retirez-le dans Ma commande pour continuer.</p>}
                <button type="submit" className="btn btn-p btn-block" style={{ marginTop: 16 }} disabled={sending || blocked}>
                  {sending ? 'Envoi en cours…' : 'Envoyer ma commande'}
                </button>
                {slow && <div className="alert info" role="status" style={{ marginTop: 12 }}><span>Envoi en cours, merci de patienter…</span></div>}
                <Link className="lnk lnk-center" to="/commande">‹ Retour à ma commande</Link>
              </div>
            </aside>
          </form>
        )}
      </div>
    </>
  );
}
