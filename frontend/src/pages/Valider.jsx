import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { TunnelHead } from '../components/PageParts.jsx';
import { DIRECTIONS_URL, RESTAURANT } from '../restaurant.js';
import PayCode from '../components/PayCode.jsx';
import { useCart, useCartDetails } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { formatPrice } from '../utils/format.js';
import { fillCode, MOBILE_MONEY, usePaymentCodes } from '../utils/payment.js';
import { normalize } from '../utils/deliveryFee.js';
import { saveCurrent } from '../utils/tracking.js';
import { checkoutOrder, kmAcceptedFor, quoteReady } from '../utils/km-fee.js';
import { Rich, useLang } from '../i18n/index.jsx';

const DRAFT_KEY = 'belchicken.infos.v1';
// zone : quartier choisi dans la grille des frais ({ id, name }) ; other : « Autre quartier »
const EMPTY = { name: '', phone: '', method: null, payer: '', mode: 'LIVRAISON', addr: '', geo: null, zone: null, other: false };

// Livraison à domicile, ou à récupérer (retrait au restaurant, sans frais de livraison).
// Libellés : i18n, checkout.modes
const MODES = [{ id: 'LIVRAISON' }, { id: 'A_EMPORTER' }];

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

function validate(f, grid, C) {
  const fields = {};
  const summary = [];
  const fail = (key, msg, short) => {
    if (key) fields[key] = msg;
    summary.push(short || msg);
  };
  if (f.name.trim().length < 2) fail('name', C.errName);
  if (!isPhone(f.phone)) fail('phone', C.errPhone);
  if (!f.method) fail('method', C.errMethod, C.errMethodShort);
  {
    if (!isPhone(f.payer)) fail('payer', C.errPayer);
  }
  // Grille des frais remplie : le client choisit son quartier (ou « Autre quartier »), ou partage sa position
  if (f.mode === 'LIVRAISON' && grid?.active && !f.zone && !f.other && !(f.geo && grid.gps)) {
    fail('zone', grid.gps ? C.errZoneGps : C.errZone, C.errZone);
  }
  if (f.mode === 'LIVRAISON' && !f.geo && f.addr.trim().length < 5) {
    fields.geo = C.errGeo;
    fail('addr', C.errAddr, C.errAddrShort);
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
  const { t } = useLang();
  const C = t.checkout;
  const [q, setQ] = useState('');
  const search = normalize(q);
  const zones = grid.zones.filter((z) => normalize(z.name).includes(search));
  // Lot 3 : la nuit, le prix affiché comprend le supplément de nuit du quartier
  const isNight = Boolean(grid.night?.isNight);
  return (
    <div className={`zone${error ? ' bad' : ''}`}>
      <label htmlFor="c-zone-q" className="zone-l">{C.zoneLabel}{!grid.gps && <i>*</i>}</label>
      <span className="hint">{grid.gps ? C.zoneHintGps : C.zoneHint}</span>
      {isNight && <span className="hint night-hint">{C.nightHint(t.fees.hour(grid.night.from), t.fees.hour(grid.night.to))}</span>}
      <input id="c-zone-q" type="search" className="zone-q" placeholder={C.zoneSearch} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-controls="c-zone-list" />
      <div className="zone-list" id="c-zone-list" role="radiogroup" aria-label={C.zoneAria} aria-describedby={error ? 'c-zone-err' : undefined}>
        {zones.map((z) => {
          const on = form.zone?.id === z.id;
          const night = isNight ? z.nightFee || 0 : 0;
          const fee = z.fee + night;
          return (
            <button key={z.id} type="button" role="radio" aria-checked={on} className={`zone-opt${on ? ' on' : ''}`} onClick={() => onPick(on ? null : { id: z.id, name: z.name }, false)}>
              <span className="rd" aria-hidden="true" />
              <span className="zone-n">{z.name}{night > 0 && <small>{t.fees.nightLine(night)}</small>}</span>
              <b className={fee === 0 ? 'free' : undefined}>{t.fees.feeLabel(fee)}</b>
            </button>
          );
        })}
        {!zones.length && <p className="zone-none">{C.zoneNone(q.trim(), grid.allowOther)}</p>}
        {grid.allowOther && (
          <button type="button" role="radio" aria-checked={form.other} className={`zone-opt other${form.other ? ' on' : ''}`} onClick={() => onPick(null, !form.other)}>
            <span className="rd" aria-hidden="true" />
            <span className="zone-n">{C.otherZone}<small>{C.otherZoneSub}</small></span>
            <b>{C.toConfirm}</b>
          </button>
        )}
      </div>
      <span className="err" id="c-zone-err">{error}</span>
    </div>
  );
}

// Frais de livraison dans le récapitulatif, avant la validation
function FeeSummary({ grid, quote }) {
  const { t } = useLang();
  const C = t.checkout;
  const { km } = C;
  const paid = t.fees.paidToCourier;
  let value = grid.gps ? C.feeChooseGps : C.feeChoose;
  let note = paid;
  let night = null; // lot 3 : « dont 500 F de supplément de nuit »
  if (quote?.loading) value = C.feeLoading;
  else if (quote?.error) [value, note] = [C.feeUnavailable, quote.error];
  else if (quote?.source === 'A_CONFIRMER') {
    value = C.toConfirm;
    note = `${t.fees.toConfirm}${quote.distanceKm != null ? ` (${km(quote.distanceKm)})` : ''}${grid.night?.isNight ? C.feeNightIncluded : ''}. ${paid}`;
  } else if (quote && quote.fee != null) {
    value = t.fees.feeLabel(quote.fee);
    if (quote.nightFee) night = t.fees.nightLine(quote.nightFee);
    const where = quote.zoneName || (quote.distanceKm != null ? km(quote.distanceKm) : '');
    note = quote.fee === 0 ? `${where ? `${where} : ` : ''}${C.feeNothing}` : `${where ? `${where}. ` : ''}${paid}`;
  }
  return (
    <div className="sum-fee" aria-live="polite">
      <div><span>{t.common.deliveryFee}</span><b className={quote?.fee === 0 ? 'free' : undefined}>{value}</b></div>
      {night && <div className="sum-night"><span>{night}</span></div>}
      <p>{note}</p>
    </div>
  );
}

// Plan 3, frais par kilomètre : « Livraison : X F (Y km), à payer au livreur », que le client accepte avant de payer
// son repas. Le montant vient toujours du serveur (aperçu) ; le site ne renvoie que le montant accepté, comparé.
function KmAccept({ quote, accepted, onAccept, onChange }) {
  const { t } = useLang();
  const K = t.checkout.kmFee;
  let body;
  if (!quote) body = <p className="km-wait">{K.waiting}</p>;
  else if (quote.loading) body = <p className="km-wait">{t.checkout.feeLoading}</p>;
  else if (quote.error) body = <p className="err-line">{quote.error}</p>;
  else {
    const km = quote.distanceKm != null ? K.road(quote.distanceKm) : null;
    const line = quote.fee === 0 ? K.lineFree(km || quote.zoneName) : quote.zoneName ? K.lineZone(formatPrice(quote.fee), quote.zoneName) : K.line(formatPrice(quote.fee), km);
    body = (
      <>
        <p className="km-line"><b>{line}</b></p>
        {quote.estimate && <p className="km-note">{K.estimate}</p>}
        {quote.fee !== 0 && <p className="km-note">{K.how}</p>}
        {accepted ? (
          <p className="km-ok">✓ {K.accepted} <button type="button" className="lnk" onClick={onChange}>{K.change}</button></p>
        ) : (
          <button type="button" className="btn btn-p" onClick={onAccept}>{K.accept}</button>
        )}
      </>
    );
  }
  return (
    <div className={`km-accept${accepted ? ' ok' : ''}`} aria-live="polite">
      <span className="km-title">{K.title}</span>
      {body}
    </div>
  );
}

// Après le choix de l'opérateur : le code marchand avec le montant des plats déjà rempli
function PayStep({ method, total, payment }) {
  const { t } = useLang();
  const C = t.checkout;
  if (!method) {
    return <p className="pay-hint">{C.payHint}</p>;
  }
  if (payment.error) {
    return (
      <div className="alert err pay-how" role="alert">
        <span>{C.payLoadFailed}<button type="button" className="lnk" onClick={payment.retry}>{t.common.retry}</button></span>
      </div>
    );
  }
  if (!payment.data) return <p className="pay-hint">{C.payLoading}</p>;
  const op = payment.data.operators.find((o) => o.method === method);
  return (
    <div className="pay-step">
      <p className="pay-step-t"><Rich text={C.payWith} amount={formatPrice(total)} operator={op.label} /></p>
      <PayCode code={fillCode(op.code, total)} />
      <div className="alert info pay-how">
        <span><Rich text={C.payMerchant} merchant={payment.data.merchantName} /></span>
      </div>
    </div>
  );
}

export default function Valider() {
  const navigate = useNavigate();
  const { lines } = useCart();
  const { items, total, ready } = useCartDetails();
  const { status, error: menuError, reload, products } = useMenu();
  const payment = usePaymentCodes();
  const { t, lang, enabled: langEnabled } = useLang();
  const C = t.checkout;
  // Erreurs du serveur dans la langue du site : le plat en cause est nommé d'après le menu chargé
  const errorText = (err) => t.error(err, {
    productName: (id) => products.get(id)?.name,
    nameAt: (i) => products.get(lines[i]?.productId)?.name,
  });
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
        setQuote({ error: errorText(e) });
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

  // Plan 3, grille par km active : le client accepte ses frais, puis seulement il paie son repas. Un autre montant
  // (nouvelle position, autre quartier, prix changé) doit être accepté à nouveau.
  const kmMode = gridOn && Boolean(grid?.km);
  const [acceptedQuote, setAcceptedQuote] = useState(null);
  const feeReady = quoteReady(quote);
  const kmAccepted = kmMode && kmAcceptedFor(quote, acceptedQuote);
  const payLocked = kmMode && !kmAccepted;

  const submit = async () => {
    if (sending) return;
    const { fields, summary } = validate(form, gridOn ? grid : null, C);
    if (gridOn && quote?.error && !fields.zone) {
      fields.zone = quote.error;
      summary.push(quote.error);
    }
    if (kmMode && !kmAccepted && !fields.zone) {
      fields.zone = C.kmFee.needAccept;
      summary.push(C.kmFee.needAccept);
    }
    setErrors(fields);
    if (summary.length) {
      setAlert(C.toComplete(summary.length, summary.join(' ')));
      return;
    }
    const payload = {
      customer: { name: form.name.trim(), phone: form.phone.trim() },
      payment: { method: form.method, payerPhone: form.payer.trim() },
      mode: form.mode,
      // Lot 8 : langue du site, seulement quand le bouton FR / EN est affiché (sinon : comme avant)
      ...(langEnabled && { language: lang.toUpperCase() }),
      ...(delivery && form.geo && {
        location: { latitude: form.geo.latitude, longitude: form.geo.longitude, accuracy: form.geo.accuracy },
      }),
      ...(delivery && form.addr.trim() && { addressNote: form.addr.trim() }),
      // Grille des frais : le choix du client et le montant qu'il a vu (comparé par le serveur, jamais un prix)
      ...(gridOn && {
        delivery: {
          ...(form.zone && { zoneId: form.zone.id }),
          ...(form.other && !form.zone && { other: true }),
          ...(kmMode
            ? kmAccepted && { expectedFee: acceptedQuote.fee } // plan 3 : le montant que le client a accepté
            : quote && !quote.loading && !quote.error && { expectedFee: quote.fee }),
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
      // Plan 4, suivi sans WhatsApp : la clé du lien de suivi, donnée une seule fois, est gardée sur ce téléphone et
      // mise dans l'adresse (le client peut garder ou partager le lien). Suivi éteint : pas de clé, comme avant.
      if (order.trackingKey) saveCurrent({ reference: order.reference, key: order.trackingKey, status: order.status });
      const query = order.trackingKey ? `?cle=${encodeURIComponent(order.trackingKey)}` : '';
      navigate(`/confirmation/${order.reference}${query}`, { replace: true, state: { order, recap } });
    } catch (err) {
      setSending(false);
      const fieldErrors = {};
      for (const d of Array.isArray(err.details) ? err.details : []) {
        const key = API_FIELDS[d.path] || (d.path?.startsWith('location') ? 'geo' : null);
        if (key && !fieldErrors[key]) fieldErrors[key] = t.fieldError(d, err);
      }
      // Un plat est passé indisponible entre-temps : on recharge le menu pour le griser
      if (err.code === 'PRODUIT_INDISPONIBLE') reload();
      // Prix changé par le Patron entre l'aperçu et l'envoi : le nouveau montant s'affiche, le client revalide
      // (ou début des heures de nuit) : la liste des quartiers est rechargée avec les prix du moment
      if (err.code === 'FRAIS_CHANGES' && err.details?.quote) {
        setQuote(err.details.quote); // plan 3 : nouveau montant, à accepter de nouveau
        loadGrid();
      }
      if (err.code === 'FRAIS_LIVRAISON') loadGrid();
      setErrors(fieldErrors);
      setAlert(errorText(err));
    }
  };

  if (status === 'error') {
    return (
      <div className="wrap pagebody tunnel-body">
        <TunnelHead title={C.title} />
        <div className="empty-page">
          <h2>{t.common.menuUnavailable}</h2><p>{t.error(menuError)}</p>
          <button className="btn btn-p" onClick={reload}>{t.common.retry}</button>
        </div>
      </div>
    );
  }
  if (ready && !items.length) return <Navigate to="/commande" replace />;

  let geoTitle = C.geoShare;
  let geoSub = C.geoShareSub;
  if (geoState === 'searching') geoTitle = C.geoSearching;
  else if (geoState === 'denied') [geoTitle, geoSub] = [C.geoDenied, C.geoDeniedSub];
  else if (geoState === 'unsupported') geoSub = C.geoUnsupported;
  else if (form.geo) [geoTitle, geoSub] = [C.geoDone, C.geoAccuracy(form.geo.accuracy)];

  // Paiement du repas, puis livraison ; plan 3 (grille par km) : livraison d'abord, paiement après « J'accepte »
  const paymentBox = (
    <section className="box">
      <div className="box-h"><span className="n">{kmMode ? 3 : 2}</span><h2>{C.payment}</h2></div>
      <div className="box-b">
        {payLocked ? <p className="pay-hint">{C.kmFee.lockPay}</p> : <>
          <fieldset>
            <legend>{C.operator}<i style={{ color: 'var(--bad)', fontStyle: 'normal' }}>*</i></legend>
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
                  <span className="l"><b>{m.label}</b><small>{C.merchantCode}</small></span>
                </button>
              ))}
            </div>
          </fieldset>
          {errors.method && <p className="err-line">{errors.method}</p>}
          <PayStep method={form.method} total={total} payment={payment} />
          <div className="fields" style={{ marginTop: 16 }}>
            <Field id="c-payer" label={C.payer} required error={errors.payer}>
              <input {...input('payer')} type="tel" inputMode="tel" placeholder="+226 76 12 34 56" />
            </Field>
          </div>
        </>}
      </div>
    </section>
  );
  const modeBox = (
    <section className="box">
      <div className="box-h"><span className="n">{kmMode ? 2 : 3}</span><h2>{C.mode}</h2></div>
      <div className="box-b">
        <div className="methods modes" role="radiogroup" aria-label={C.mode}>
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={form.mode === m.id} className={`opt${form.mode === m.id ? ' on' : ''}`} onClick={() => set('mode', m.id)}>
              <span className="rd" aria-hidden="true" />
              <span className="l"><b>{C.modes[m.id][0]}</b><small>{C.modes[m.id][1]}</small></span>
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
                {form.geo ? C.geoRefresh : C.geoButton}
              </button>
            </div>
            {errors.geo && <p className="err-line">{errors.geo}</p>}
            <div className="fields" style={{ marginTop: 16 }}>
              <Field id="c-addr" label={gridOn ? C.landmarks : C.zoneLandmarks} hint={C.landmarksHint} error={errors.addr} full>
                <textarea {...input('addr')} placeholder={gridOn ? C.landmarksPh : C.zoneLandmarksPh} maxLength={300} />
              </Field>
            </div>
            {kmMode && <KmAccept quote={feeReady || quote?.loading || quote?.error ? quote : null} accepted={kmAccepted} onAccept={() => { setAcceptedQuote(quote); setErrors(({ zone: _, ...rest }) => rest); }} onChange={() => setAcceptedQuote(null)} />}
          </>
        ) : (
          <div className="pickup">
            <div className="ic"><PinIcon /></div>
            <div className="pickup-t">
              <b>{RESTAURANT.name}</b>
              <span>{t.restaurant.address}, {RESTAURANT.city}</span>
              <small>{t.restaurant.hours.map((h) => `${h.days} : ${h.time}`).join(' · ')}</small>
              <small>{C.pickupWrite}</small>
            </div>
            <a className="btn btn-s" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">{t.common.directions}</a>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <>
      <div className="wrap pagebody tunnel-body" style={{ maxWidth: 1160 }}>
        <TunnelHead title={C.title} step={2}>
          <Rich text={C.required} star={<i className="req-star">*</i>} />
        </TunnelHead>
        {alert && <div className="alert err" role="alert" ref={alertRef}><span>{alert}</span></div>}

        {!ready ? (
          <div className="empty-page"><p>{t.common.loadingOrder}</p></div>
        ) : (
          <form className="co" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div>
              <section className="box">
                <div className="box-h"><span className="n">1</span><h2>{C.contact}</h2></div>
                <div className="box-b"><div className="fields">
                  <Field id="c-name" label={C.name} required error={errors.name}>
                    <input {...input('name')} autoComplete="name" placeholder="Awa Ouédraogo" maxLength={80} />
                  </Field>
                  <Field id="c-phone" label={C.phone} required error={errors.phone}>
                    <input {...input('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+226 76 12 34 56" />
                  </Field>
                </div></div>
              </section>

              {/* Plan 3, grille par km : la livraison (et ses frais à accepter) avant le paiement du repas */}
              {checkoutOrder(kmMode).slice(1).map((step) => <Fragment key={step}>{step === 'mode' ? modeBox : paymentBox}</Fragment>)}
            </div>

            <aside className="box sum">
              <div className="box-h"><h2>{C.yourOrder}</h2></div>
              <div className="box-b">
                <table><tbody>
                  {items.map((i) => (
                    <tr key={i.key}>
                      <td>{i.quantity} × {i.product.name}{i.options && <small>{i.options}</small>}</td>
                      <td>{formatPrice(i.amount)}</td>
                    </tr>
                  ))}
                  <tr className="tot"><td>{t.common.itemsTotal}</td><td>{formatPrice(total)}</td></tr>
                </tbody></table>
                {gridOn ? (
                  <FeeSummary grid={grid} quote={quote} />
                ) : delivery ? (
                  <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>{grid?.independent ? t.fees.independent : C.feeLater}</p>
                ) : (
                  <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>{C.pickupNote(t.restaurant.address)}</p>
                )}
                {blocked && <p className="err-line" style={{ marginTop: 12 }}>{C.blocked}</p>}
                <button type="submit" className="btn btn-p btn-block" style={{ marginTop: 16 }} disabled={sending || blocked}>
                  {sending ? C.sending : C.send}
                </button>
                {slow && <div className="alert info" role="status" style={{ marginTop: 12 }}><span>{C.slow}</span></div>}
                <Link className="lnk lnk-center" to="/commande">{C.back}</Link>
              </div>
            </aside>
          </form>
        )}
      </div>
    </>
  );
}
