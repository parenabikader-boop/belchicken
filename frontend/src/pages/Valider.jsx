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
import { FEE_PAID_TO_COURIER, FEE_TO_CONFIRM, feeLabel, hourLabel, nightLine, normalize } from '../utils/deliveryFee.js';

const DRAFT_KEY = 'belchicken.infos.v1';
// zone : quartier choisi dans la grille des frais ({ id, name }) ; other : « Autre quartier »
const EMPTY = { name: '', phone: '', method: null, payer: '', mode: 'LIVRAISON', addr: '', geo: null, zone: null, other: false };

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
  delivery: 'zone',
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

function validate(f, grid) {
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
  // Grille des frais remplie : le client choisit son quartier (ou « Autre quartier »), ou partage sa position
  if (f.mode === 'LIVRAISON' && grid?.active && !f.zone && !f.other && !(f.geo && grid.gps)) {
    fail('zone', grid.gps ? 'Choisissez votre quartier ou partagez votre position.' : 'Choisissez votre quartier.', 'Choisissez votre quartier.');
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

// Liste des quartiers de la grille, avec recherche, et « Autre quartier » si le Patron le propose
function ZonePicker({ grid, form, onPick, error }) {
  const [q, setQ] = useState('');
  const search = normalize(q);
  const zones = grid.zones.filter((z) => normalize(z.name).includes(search));
  // Lot 3 : la nuit, le prix affiché comprend le supplément de nuit du quartier
  const isNight = Boolean(grid.night?.isNight);
  return (
    <div className={`zone${error ? ' bad' : ''}`}>
      <label htmlFor="c-zone-q" className="zone-l">Votre quartier {!grid.gps && <i>*</i>}</label>
      <span className="hint">{grid.gps ? 'Choisissez votre quartier, ou partagez votre position ci-dessous : les frais suivent alors la distance.' : 'Les frais de livraison dépendent du quartier.'}</span>
      {isNight && <span className="hint night-hint">Supplément de nuit compris dans les prix, de {hourLabel(grid.night.from)} à {hourLabel(grid.night.to)}.</span>}
      <input id="c-zone-q" type="search" className="zone-q" placeholder="Rechercher votre quartier" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-controls="c-zone-list" />
      <div className="zone-list" id="c-zone-list" role="radiogroup" aria-label="Quartier" aria-describedby={error ? 'c-zone-err' : undefined}>
        {zones.map((z) => {
          const on = form.zone?.id === z.id;
          const night = isNight ? z.nightFee || 0 : 0;
          const fee = z.fee + night;
          return (
            <button key={z.id} type="button" role="radio" aria-checked={on} className={`zone-opt${on ? ' on' : ''}`} onClick={() => onPick(on ? null : { id: z.id, name: z.name }, false)}>
              <span className="rd" aria-hidden="true" />
              <span className="zone-n">{z.name}{night > 0 && <small>{nightLine(night)}</small>}</span>
              <b className={fee === 0 ? 'free' : undefined}>{feeLabel(fee)}</b>
            </button>
          );
        })}
        {!zones.length && <p className="zone-none">Aucun quartier ne correspond à « {q.trim()} ».{grid.allowOther ? ' Choisissez « Autre quartier ».' : ''}</p>}
        {grid.allowOther && (
          <button type="button" role="radio" aria-checked={form.other} className={`zone-opt other${form.other ? ' on' : ''}`} onClick={() => onPick(null, !form.other)}>
            <span className="rd" aria-hidden="true" />
            <span className="zone-n">Autre quartier<small>Vous ne trouvez pas le vôtre dans la liste</small></span>
            <b>À confirmer</b>
          </button>
        )}
      </div>
      <span className="err" id="c-zone-err">{error}</span>
    </div>
  );
}

const km = (d) => `environ ${String(d).replace('.', ',')} km du restaurant`;

// Frais de livraison dans le récapitulatif, avant la validation
function FeeSummary({ grid, quote }) {
  let value = grid.gps ? 'Choisissez votre quartier ou partagez votre position' : 'Choisissez votre quartier';
  let note = FEE_PAID_TO_COURIER;
  let night = null; // lot 3 : « dont 500 F de supplément de nuit »
  if (quote?.loading) value = 'Calcul…';
  else if (quote?.error) [value, note] = ['Indisponibles', quote.error];
  else if (quote?.source === 'A_CONFIRMER') {
    value = 'À confirmer';
    note = `${FEE_TO_CONFIRM}${quote.distanceKm != null ? ` (${km(quote.distanceKm)})` : ''}${grid.night?.isNight ? ', supplément de nuit compris' : ''}. ${FEE_PAID_TO_COURIER}`;
  } else if (quote && quote.fee != null) {
    value = feeLabel(quote.fee);
    if (quote.nightFee) night = nightLine(quote.nightFee);
    const where = quote.zoneName || (quote.distanceKm != null ? km(quote.distanceKm) : '');
    note = quote.fee === 0 ? `${where ? `${where} : ` : ''}rien à payer au livreur.` : `${where ? `${where}. ` : ''}${FEE_PAID_TO_COURIER}`;
  }
  return (
    <div className="sum-fee" aria-live="polite">
      <div><span>Frais de livraison</span><b className={quote?.fee === 0 ? 'free' : undefined}>{value}</b></div>
      {night && <div className="sum-night"><span>{night}</span></div>}
      <p>{note}</p>
    </div>
  );
}

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
  // Grille des frais de livraison (null = pas encore chargée ou indisponible : fonctionnement d'avant)
  const [grid, setGrid] = useState(null);
  const [quote, setQuote] = useState(null); // aperçu des frais, calculé par le serveur
  const loadGrid = () => api.getDelivery().then(setGrid, () => setGrid(null));
  useEffect(() => {
    loadGrid();
  }, []);
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
  const gridOn = delivery && Boolean(grid?.active);

  // Quartier gardé dans le brouillon mais retiré de la grille entre-temps : à choisir à nouveau
  useEffect(() => {
    if (grid?.active && form.zone && !grid.zones.some((z) => z.id === form.zone.id)) set('zone', null);
    if (grid?.active && form.other && !grid.allowOther) set('other', false);
  }, [grid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aperçu des frais : demandé au serveur à chaque changement de quartier ou de position
  const geoKey = form.geo ? `${form.geo.latitude},${form.geo.longitude},${form.geo.accuracy}` : '';
  useEffect(() => {
    if (!gridOn) return setQuote(null);
    const choice = form.zone ? { zoneId: form.zone.id } : form.other ? { other: true } : form.geo && grid.gps ? {} : null;
    if (!choice) return setQuote(null);
    if (form.geo) choice.location = form.geo;
    let alive = true;
    setQuote({ loading: true });
    api.quoteDelivery(choice).then(
      (q) => alive && setQuote(q),
      (e) => {
        if (!alive) return;
        setQuote({ error: e.message });
        if (e.code === 'FRAIS_LIVRAISON') loadGrid(); // quartier retiré entre-temps
      },
    );
    return () => {
      alive = false;
    };
  }, [gridOn, form.zone?.id, form.other, geoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickZone = (zone, other) => {
    setForm((f) => ({ ...f, zone, other }));
    setErrors(({ zone: _, ...rest }) => rest);
  };

  const submit = async () => {
    if (sending) return;
    const { fields, summary } = validate(form, gridOn ? grid : null);
    if (gridOn && quote?.error && !fields.zone) {
      fields.zone = quote.error;
      summary.push(quote.error);
    }
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
      // Grille des frais : le choix du client et le montant qu'il a vu (comparé par le serveur, jamais un prix)
      ...(gridOn && {
        delivery: {
          ...(form.zone && { zoneId: form.zone.id }),
          ...(form.other && !form.zone && { other: true }),
          ...(quote && !quote.loading && !quote.error && { expectedFee: quote.fee }),
        },
      }),
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
        zone: gridOn ? form.zone?.name || (form.other ? 'Autre quartier' : '') : '',
      };
      // Le panier est vidé par la page de confirmation : le vider ici ferait d'abord revenir
      // cette page, panier vide, sur Ma commande
      clearDraft();
      navigate(`/confirmation/${order.reference}`, { replace: true, state: { order, recap } });
    } catch (err) {
      setSending(false);
      const fieldErrors = {};
      for (const d of Array.isArray(err.details) ? err.details : []) {
        const key = API_FIELDS[d.path] || (d.path?.startsWith('location') ? 'geo' : null);
        if (key && !fieldErrors[key]) fieldErrors[key] = d.message;
      }
      // Un plat est passé indisponible entre-temps : on recharge le menu pour le griser
      if (err.code === 'PRODUIT_INDISPONIBLE') reload();
      // Prix changé par le Patron entre l'aperçu et l'envoi : le nouveau montant s'affiche, le client revalide
      // (ou début des heures de nuit) : la liste des quartiers est rechargée avec les prix du moment
      if (err.code === 'FRAIS_CHANGES' && err.details?.quote) {
        setQuote(err.details.quote);
        loadGrid();
      }
      if (err.code === 'FRAIS_LIVRAISON') loadGrid();
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
                      {gridOn && <ZonePicker grid={grid} form={form} onPick={pickZone} error={errors.zone} />}
                      <div className={`geo${form.geo && !geoState ? ' ok' : ''}`} style={{ marginTop: 16 }}>
                        <div className="ic"><PinIcon /></div>
                        <div style={{ flex: 1 }} aria-live="polite"><b>{geoTitle}</b><span>{geoSub}</span></div>
                        <button type="button" className="btn btn-s" style={{ padding: '9px 16px' }} onClick={locate} disabled={geoState === 'searching'}>
                          {form.geo ? 'Actualiser' : 'Partager'}
                        </button>
                      </div>
                      {errors.geo && <p className="err-line">{errors.geo}</p>}
                      <div className="fields" style={{ marginTop: 16 }}>
                        <Field id="c-addr" label={gridOn ? 'Points de repère' : 'Quartier et points de repère'} hint="Obligatoire si vous ne partagez pas votre position" error={errors.addr} full>
                          <textarea {...input('addr')} placeholder={gridOn ? 'Portail bleu après la pharmacie' : 'Patte d’Oie, portail bleu après la pharmacie'} maxLength={300} />
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
                {gridOn ? (
                  <FeeSummary grid={grid} quote={quote} />
                ) : delivery ? (
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
