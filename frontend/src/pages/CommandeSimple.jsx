import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import PayCode from '../components/PayCode.jsx';
import { Lines } from '../components/CartSheet.jsx';
import { useCart, useCartDetails } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { RESTAURANT } from '../restaurant.js';
import { formatPrice } from '../utils/format.js';
import { fillCode, MOBILE_MONEY, usePaymentCodes } from '../utils/payment.js';
import { saveCurrent } from '../utils/tracking.js';
import {
  deliveryPayload, deliveryPrice, locationPayload, mapLocation, MAX_ACCURACY_M, missingFields, paymentVisible,
} from '../utils/simple-order.js';
import { useLang } from '../i18n/index.jsx';

// Carte OpenStreetMap, téléchargée seulement quand elle s'ouvre
const MapPicker = lazy(() => import('../components/MapPicker.jsx'));

// Lot « Commande simplifiée » (interrupteur COMMANDE_SIMPLIFIEE) : une seule page, dans l'ordre, très peu de texte :
//   0. récapitulatif replié (« 3 articles · 7 500 F », « Modifier » : plats, + et −, retirer) ;
//   a. Livraison ou À récupérer ;
//   b. livraison : « Ma position » (ou un point sur la carte) OBLIGATOIRE ; le prix calculé par le serveur s'affiche
//      dans le bouton « Livraison · 1 400 F » (km en petit) ; un repère facultatif ;
//   c. nom et téléphone ;
//   d. paiement, seulement une fois le prix de livraison affiché (tout de suite à récupérer), puis « Envoyer ma commande ».
// Jamais de quartier. Les prix sont toujours calculés par le serveur : le site renvoie seulement le montant affiché.
const DRAFT_KEY = 'belchicken.simple.v1';
const EMPTY = { mode: 'LIVRAISON', name: '', phone: '', method: null, payer: '', note: '' };

function readDraft() {
  try {
    const d = { ...EMPTY, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY)) };
    if (!MOBILE_MONEY.some((m) => m.id === d.method)) d.method = null;
    if (!['LIVRAISON', 'A_EMPORTER'].includes(d.mode)) d.mode = 'LIVRAISON';
    return d;
  } catch {
    return EMPTY;
  }
}
const storeDraft = (d) => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* stockage indisponible */
  }
};
const clearDraft = () => {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* rien à faire */
  }
};

export default function CommandeSimple() {
  const navigate = useNavigate();
  const { lines } = useCart();
  const { items, total, count, ready } = useCartDetails();
  const [cartOpen, setCartOpen] = useState(false); // récapitulatif replié sur une ligne
  const { reload, products } = useMenu();
  const payment = usePaymentCodes();
  const { t, lang, enabled: langEnabled } = useLang();
  const S = t.simple;
  const errorText = (err) => t.error(err, { productName: (id) => products.get(id)?.name, nameAt: (i) => products.get(lines[i]?.productId)?.name });

  const [f, setF] = useState(readDraft);
  const [geo, setGeo] = useState(null);
  const [geoState, setGeoState] = useState(null); // null | 'searching' | 'denied' | 'unsupported'
  const [showMap, setShowMap] = useState(false);
  const [grid, setGrid] = useState(undefined); // undefined : chargement ; null : indisponible
  const [quote, setQuote] = useState(null);
  const [alert, setAlert] = useState('');
  const [sending, setSending] = useState(false);
  const alertRef = useRef(null);

  useEffect(() => storeDraft(f), [f]);
  useEffect(() => {
    api.getDelivery().then(setGrid, () => setGrid(null));
  }, []);
  useEffect(() => {
    if (alert) alertRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [alert]);

  const set = (key, value) => setF((x) => ({ ...x, [key]: value }));
  const delivery = f.mode === 'LIVRAISON';
  const gridOn = Boolean(grid?.active) && !grid?.independent;

  // Prix de livraison : demandé au serveur dès que la position est connue (jamais de quartier)
  const geoKey = geo ? `${geo.latitude},${geo.longitude},${geo.accuracy ?? ''}` : '';
  useEffect(() => {
    if (!delivery || !geo || !gridOn) return setQuote(null);
    let alive = true;
    setQuote({ loading: true });
    api.quoteDelivery({ location: locationPayload(geo) }).then(
      (q) => alive && setQuote(q),
      (e) => alive && setQuote({ error: errorText(e) }),
    );
    return () => {
      alive = false;
    };
  }, [delivery, gridOn, geoKey]); // relancé à chaque nouvelle position

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoState('unsupported');
      setShowMap(true);
      return;
    }
    setGeoState('searching');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoState(null);
        const point = { latitude: +coords.latitude.toFixed(6), longitude: +coords.longitude.toFixed(6), accuracy: Math.round(coords.accuracy) };
        setGeo(point);
        if (point.accuracy > MAX_ACCURACY_M) setShowMap(true); // trop imprécise : le client pose son point
      },
      () => {
        setGeoState('denied');
        setShowMap(true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  if (ready && !items.length) return <Navigate to="/menu" replace />;

  const price = deliveryPrice(quote);
  const showPay = paymentVisible({ mode: f.mode, geo, quote, gridOn });
  const op = payment.data?.operators.find((o) => o.method === f.method);

  const submit = async () => {
    if (sending) return;
    const missing = missingFields({ ...f, geo }, { gridOn: delivery && gridOn, quote });
    if (missing.length) {
      setAlert(`${S.missingLead} ${missing.map((k) => S.missing[k]).join(', ')}.`);
      return;
    }
    const deliveryChoice = deliveryPayload({ mode: f.mode, gridOn, quote });
    const payload = {
      customer: { name: f.name.trim(), phone: f.phone.trim() },
      payment: { method: f.method, payerPhone: f.payer.trim() },
      mode: f.mode,
      ...(langEnabled && { language: lang.toUpperCase() }),
      ...(delivery && { location: locationPayload(geo) }),
      ...(delivery && f.note.trim() && { addressNote: f.note.trim() }),
      ...(deliveryChoice && { delivery: deliveryChoice }),
      // Jamais de prix : le serveur les recalcule
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        ...(l.choice && { choice: l.choice }),
        ...(l.note && { note: l.note }),
        ...(l.drinks?.length && { drinks: l.drinks.map((d) => ({ productId: d.productId, quantity: d.quantity })) }),
      })),
    };
    setAlert('');
    setSending(true);
    try {
      const order = await api.createOrder(payload);
      const recap = {
        name: payload.customer.name, phone: payload.customer.phone, method: f.method, payer: payload.payment.payerPhone,
        mode: f.mode, geo: delivery, addr: payload.addressNote || '', zone: '',
      };
      clearDraft();
      if (order.trackingKey) saveCurrent({ reference: order.reference, key: order.trackingKey, status: order.status });
      const query = order.trackingKey ? `?cle=${encodeURIComponent(order.trackingKey)}` : '';
      navigate(`/confirmation/${order.reference}${query}`, { replace: true, state: { order, recap } });
    } catch (err) {
      setSending(false);
      if (err.code === 'PRODUIT_INDISPONIBLE') reload();
      if (err.code === 'FRAIS_CHANGES' && err.details?.quote) setQuote(err.details.quote); // nouveau prix affiché
      setAlert(errorText(err));
    }
  };

  // Prix de livraison collé au mot « Livraison » : « Livraison · 1 400 F », les km en petit (rien sans position)
  let feeShort = null;
  if (delivery && geo && quote?.loading) feeShort = '…';
  else if (delivery && geo && price) feeShort = price.fee == null ? S.priceTbc : price.fee === 0 ? S.priceFreeShort : formatPrice(price.fee);
  const kmShort = delivery && geo && price?.km != null ? `${S.km(price.km)}${price.estimate ? ' ~' : ''}` : null;
  const recap = !delivery || price?.fee === 0
    ? S.recap(formatPrice(total), null)
    : price?.fee ? S.recap(formatPrice(total), formatPrice(price.fee)) : S.recapLater(formatPrice(total));

  return (
    <div className="wrap pagebody cs-page">
      <h1 className="cs-title">{S.title}</h1>
      {alert && <div className="alert err" role="alert" ref={alertRef}><span>{alert}</span></div>}

      {/* Récapitulatif replié sur une ligne ; « Modifier » : plats, + et −, retirer (panier vide : retour au menu) */}
      <section className="cs-block cs-cart">
        <div className="cs-cart-row">
          <b>{S.summary(count, formatPrice(total))}</b>
          <button type="button" className="lnk cs-link" aria-expanded={cartOpen} onClick={() => setCartOpen((o) => !o)}>{cartOpen ? S.editDone : S.edit}</button>
        </div>
        {cartOpen && <Lines items={items} />}
        {items.some((i) => i.problem) && <p className="cs-bad">{t.cart.blocked}</p>}
      </section>

      {/* a. Livraison ou À récupérer */}
      <section className="cs-block">
        <div className="cs-modes" role="radiogroup" aria-label={S.title}>
          {[['LIVRAISON', S.delivery], ['A_EMPORTER', S.pickup]].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={f.mode === id} className={`cs-mode${f.mode === id ? ' on' : ''}`} onClick={() => set('mode', id)}>
              <span>{label}{id === 'LIVRAISON' && feeShort && <> · {feeShort}</>}</span>
              {id === 'LIVRAISON' && kmShort && <small className="cs-km">{kmShort}</small>}
            </button>
          ))}
        </div>
      </section>

      {/* b. Position et prix de livraison (ou adresse du restaurant) */}
      <section className="cs-block">
        {delivery ? (
          <>
            <button type="button" className="btn btn-p btn-block cs-big" onClick={locate} disabled={geoState === 'searching'}>
              {geoState === 'searching' ? S.locating : geo && !geo.picked ? S.relocate : S.useLocation}
            </button>
            {(geoState === 'denied' || geoState === 'unsupported') && <p className="cs-muted">{S.geoRefused}</p>}
            {geo && !showMap && <p className="cs-ok">✓ {geo.picked ? S.mapDone : S.geoDone}</p>}
            {showMap ? (
              <Suspense fallback={<p className="cs-muted">…</p>}>
                <MapPicker value={geo} center={RESTAURANT} hint={S.mapHint} onPick={(p) => setGeo(mapLocation(p))} />
              </Suspense>
            ) : (
              <button type="button" className="lnk cs-link" onClick={() => setShowMap(true)}>{S.onMap}</button>
            )}
            {/* Prix impossible (trop loin, position imprécise…) : une seule ligne, le paiement reste caché */}
            {geo && quote?.error && <p className="cs-bad" role="alert">{quote.error}</p>}
            <label className="cs-label" htmlFor="cs-note">{S.landmark}</label>
            <input id="cs-note" className="cs-input" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder={S.landmarkPh} maxLength={300} />
          </>
        ) : (
          <p className="cs-muted">{S.pickupAt(t.restaurant.address)}</p>
        )}
      </section>

      {/* c. Nom et téléphone */}
      <section className="cs-block">
        <label className="cs-label" htmlFor="cs-name">{S.name}</label>
        <input id="cs-name" className="cs-input" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={80} />
        <label className="cs-label" htmlFor="cs-phone">{S.phone}</label>
        <input id="cs-phone" className="cs-input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="70 12 34 56" />
      </section>

      {/* d. Paiement : seulement une fois le prix de livraison affiché (tout de suite à récupérer) */}
      {showPay && (
        <section className="cs-block">
          <h2 className="cs-h">{S.pay}</h2>
          <div className="cs-ops" role="radiogroup" aria-label={S.pay}>
            {MOBILE_MONEY.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={f.method === m.id} className={`cs-op${f.method === m.id ? ' on' : ''}`} onClick={() => set('method', m.id)}>
                <span className={m.cls}>{m.logo}</span><b>{m.label}</b>
              </button>
            ))}
          </div>
          {f.method && op && <PayCode code={fillCode(op.code, total)} />}
          {f.method && payment.error && <button type="button" className="lnk" onClick={payment.retry}>{t.common.retry}</button>}
          <label className="cs-label" htmlFor="cs-payer">{S.payer}</label>
          <input id="cs-payer" className="cs-input" type="tel" inputMode="tel" value={f.payer} onChange={(e) => set('payer', e.target.value)} placeholder="70 12 34 56" />
          <p className="cs-recap">{recap}</p>
          <button type="button" className="btn btn-p btn-block cs-big" disabled={sending || items.some((i) => i.problem)} onClick={submit}>{sending ? S.sending : S.send}</button>
        </section>
      )}
    </div>
  );
}
