import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { WHATSAPP } from '../components/Layout.jsx';
import { DIRECTIONS_URL, RESTAURANT, whatsappHref } from '../restaurant.js';
import PayCode from '../components/PayCode.jsx';
import { METHOD_LABEL } from '../utils/payment.js';
import { TunnelHead } from '../components/PageParts.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { Rich, useT } from '../i18n/index.jsx';

// Rafraîchissement de la page de suivi, tant que la commande n'est ni livrée ni annulée
const REFRESH_MS = 20000;
const FINAL = ['LIVREE', 'ANNULEE'];

// Frise : les étapes vues par le client (livraison, ou à emporter avec « Prête » et « Retirée »).
// Libellés : i18n, tracking.steps (key)
const DELIVERY_STEPS = [
  { status: 'PAIEMENT_A_VERIFIER', key: 'PAIEMENT_A_VERIFIER' },
  { status: 'PAYEE', key: 'PAYEE' },
  { status: 'EN_PREPARATION', key: 'EN_PREPARATION' },
  { status: 'EN_LIVRAISON', key: 'EN_LIVRAISON' },
  { status: 'LIVREE', key: 'LIVREE' },
];
const PICKUP_STEPS = [
  ...DELIVERY_STEPS.slice(0, 3),
  { status: 'PRETE', key: 'PRETE' },
  { status: 'LIVREE', key: 'RETIREE' },
];
const isPickup = (order) => order.mode === 'A_EMPORTER';

// Message prérempli pour le call center : toujours en français (c'est l'équipe qui le lit)
const contactHref = (reference) =>
  whatsappHref(WHATSAPP, `Bonjour, je vous contacte au sujet de ma commande ${reference}.`);

// Page de suivi : /confirmation/:reference (juste après l'envoi) et /suivi/:reference (lien envoyé
// sur WhatsApp). Elle relit la commande toutes les 20 s. Juste après l'envoi, elle reçoit aussi les
// coordonnées du client (state de navigation) ; l'API, elle, ne renvoie jamais ni nom, ni numéro, ni position.
export default function Confirmation() {
  const { reference } = useParams();
  const { state } = useLocation();
  const fresh = state?.order?.reference === reference.toUpperCase() ? state : null;
  const [order, setOrder] = useState(fresh?.order || null);
  const [error, setError] = useState(null);
  const { clear } = useCart();
  const t = useT();
  const T = t.tracking;

  // Commande tout juste envoyée : on vide le panier
  useEffect(() => {
    if (fresh) clear();
  }, [fresh, clear]);

  const load = useCallback(() => {
    api.getOrder(reference).then(
      (o) => {
        setOrder(o);
        setError(null);
      },
      (e) => setError(e),
    );
  }, [reference]);

  useEffect(load, [load]);

  const done = order && FINAL.includes(order.status);
  useEffect(() => {
    if (done) return undefined;
    const t = setInterval(() => !document.hidden && load(), REFRESH_MS);
    // Retour sur la page (téléphone remis en marche, autre application) : mise à jour tout de suite
    const onShow = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [done, load]);

  if (!order) {
    return (
      <div className="wrap pagebody tunnel-body">
        <TunnelHead title={T.title} />
        {error ? (
          <>
            <div className="alert err" role="alert"><span>{t.error(error)}</span></div>
            <Link className="lnk" to="/menu">{t.layout.backToMenu}</Link>
          </>
        ) : (
          <div className="alert info" role="status"><span>{t.common.loadingOrder}</span></div>
        )}
      </div>
    );
  }

  const recap = fresh?.recap;
  const pickup = isPickup(order);
  // Quartier choisi (copié dans la commande, visible aussi sans le récapitulatif), position, repères
  const delivery = !pickup && [order.deliveryZoneName, recap?.geo && T.positionShared, recap?.addr].filter(Boolean).join(' · ');
  const toConfirm = order.deliveryFeeSource === 'A_CONFIRMER';
  const fee = order.deliveryFee;

  return (
    <div className="wrap pagebody tunnel-body">
      <TunnelHead title={fresh ? T.sent : T.title} step={fresh ? 3 : undefined}>
        {recap ? T.introFresh(recap.phone) : T.intro(order.reference)}
      </TunnelHead>
      <div className="receipt">
        <Tracking order={order} offline={Boolean(error)} />

        <div className="doc">
          <div className="doc-top">
            <div className="brand"><span className="mark"><span>B</span></span><span><b>Belchicken</b><small>{T.summary}</small></span></div>
            <div className="ref"><span>{T.reference}</span><b>{order.reference}</b><span>{t.date.full(order.createdAt)}</span></div>
          </div>
          <table>
            <thead><tr><th>{T.item}</th><th className="r">{T.qty}</th><th className="r">{T.amount}</th></tr></thead>
            <tbody>
              {order.items.map((i, k) => {
                const details = [i.variantLabel, i.choice, t.fees.drinks(i.drinks, i.quantity), i.note].filter(Boolean).join(' · ');
                return (
                  <tr key={k}>
                    <td>
                      {i.productNumber != null && `${t.common.number(i.productNumber)} · `}{i.productName}
                      {details && <div className="muted" style={{ fontSize: 12 }}>{details}</div>}
                    </td>
                    <td className="r">{i.quantity}</td>
                    <td className="r">{formatPrice(i.lineTotal)}</td>
                  </tr>
                );
              })}
              <tr className={fee != null ? 'sub' : 'tot'}><td>{t.common.itemsTotal}</td><td></td><td className="r">{formatPrice(order.itemsTotal)}</td></tr>
              {fee != null && (
                <>
                  <tr className="sub"><td>{t.common.deliveryFee}{order.deliveryNightFee > 0 && <small className="trk-night">{t.fees.nightLine(order.deliveryNightFee)}</small>}</td><td></td><td className="r">{t.fees.feeLabel(fee)}</td></tr>
                  <tr className="tot"><td>{T.total}</td><td></td><td className="r">{formatPrice(order.itemsTotal + fee)}</td></tr>
                </>
              )}
            </tbody>
          </table>
          <dl>
            {recap && <><dt>{T.customer}</dt><dd>{recap.name} · {recap.phone}</dd></>}
            <dt>{T.payment}</dt>
            <dd>{METHOD_LABEL[order.paymentMethod] || order.paymentMethod}{recap && T.paidFrom(recap.payer)}</dd>
            {delivery && <><dt>{T.delivery}</dt><dd>{delivery}</dd></>}
            {pickup && <><dt>{T.pickup}</dt><dd>{T.pickupInfo(t.restaurant.address)}</dd></>}
            {!pickup && (fee != null || order.status !== 'ANNULEE') && (
              <>
                <dt>{t.common.deliveryFee}</dt>
                <dd>
                  {order.independentDelivery
                    ? t.fees.independent
                    : fee == null
                    ? toConfirm
                      ? T.feeToConfirm
                      : T.feeLater
                    : fee === 0
                      ? T.feeFree
                      : `${formatPrice(fee)}${order.deliveryNightFee > 0 ? `, ${t.fees.nightLine(order.deliveryNightFee)}` : ''} · ${order.deliveryFeePaid ? T.feePaid : T.feeDue}`}
                </dd>
              </>
            )}
          </dl>
        </div>
        <div className="rc-actions">
          <a className="btn btn-wa" href={contactHref(order.reference)} target="_blank" rel="noreferrer">{t.common.contactWhatsapp}</a>
          <button type="button" className="btn btn-s" onClick={() => window.print()}>{T.print}</button>
          <Link className="btn btn-s" to="/menu">{T.backToMenu}</Link>
        </div>
      </div>
    </div>
  );
}

// Où en est la commande : frise des étapes et ce que le client doit savoir maintenant
function Tracking({ order, offline }) {
  const t = useT();
  const T = t.tracking;
  const STEPS = isPickup(order) ? PICKUP_STEPS : DELIVERY_STEPS;
  const cancelled = order.status === 'ANNULEE';
  const at = Object.fromEntries((order.steps || []).map((s) => [s.status, s.at]));
  at.PAIEMENT_A_VERIFIER ??= order.createdAt;
  // Étape atteinte : la dernière de la frise (pour une commande annulée, la dernière avant l'annulation)
  const reached = cancelled
    ? Math.max(0, ...STEPS.map((s, i) => (at[s.status] ? i : 0)))
    : STEPS.findIndex((s) => s.status === order.status);

  return (
    <section className={`trk${cancelled ? ' off' : ''}`} aria-label={T.aria}>
      <div className="trk-head">
        <h2>{cancelled ? T.cancelled : T.steps[STEPS[reached].key]}</h2>
        {!FINAL.includes(order.status) && (
          <span className={`trk-live${offline ? ' off' : ''}`}>{offline ? T.offline : T.live}</span>
        )}
      </div>

      <ol className="trk-steps">
        {STEPS.map((s, i) => {
          // Annulée : les étapes atteintes restent cochées. Livrée : tout est coché.
          let state = 'todo';
          if (i < reached || (i === reached && (cancelled || order.status === 'LIVREE'))) state = 'done';
          else if (i === reached) state = 'cur';
          return (
            <li key={s.status} className={state} aria-current={state === 'cur' ? 'step' : undefined}>
              <span className="trk-dot" aria-hidden="true" />
              <b>{T.steps[s.key]}</b>
              <small>{at[s.status] && state !== 'todo' ? t.date.time(at[s.status]) : ' '}</small>
            </li>
          );
        })}
      </ol>

      <Now order={order} />
    </section>
  );
}

// Frais de livraison : payés au livreur à la réception, en espèces ou par mobile money avec le code marchand
function FeeToPay({ fee, nightFee, feePayment, children }) {
  const t = useT();
  const T = t.tracking;
  // feePayment : codes avec le montant des frais, donnés par le serveur (les mêmes que dans les messages WhatsApp)
  return (
    <div className="trk-fee">
      {children}
      <p>{t.common.deliveryFee}</p>
      <b>{formatPrice(fee)}</b>
      {nightFee > 0 && <p className="trk-night">{t.fees.nightLine(nightFee)}</p>}
      <p>{T.feeHow}</p>
      {feePayment && (
        <>
          <div className="trk-codes">
            {feePayment.operators.map((op) => <PayCode key={op.method} label={op.label} code={op.code} compact />)}
          </div>
          <p className="trk-merchant">
            {/* Lot 5 : en mode Prestataire, les frais vont à notre partenaire de livraison (nom affiché = notre société) */}
            <Rich text={T.feeMerchant} merchant={feePayment.merchantName} account={feePayment.operator === 'PRESTATAIRE' ? T.accountPartner : T.accountBelchicken} />
          </p>
        </>
      )}
    </div>
  );
}

// À emporter : pas de frais, l'adresse du restaurant quand la commande est prête
function PickupNow({ order }) {
  const t = useT();
  const T = t.tracking;
  switch (order.status) {
    case 'PAIEMENT_A_VERIFIER':
      return <p className="trk-now"><Rich text={T.pickupChecking} amount={formatPrice(order.itemsTotal)} /></p>;
    case 'PAYEE':
      return <p className="trk-now ok">{T.pickupPaid}</p>;
    case 'EN_PREPARATION':
      return <p className="trk-now">{T.pickupPreparing}</p>;
    case 'PRETE':
      return (
        <div className="trk-ready">
          <p className="trk-fee-lead">{T.pickupReady}</p>
          <p><b>{RESTAURANT.name}</b><br />{t.restaurant.address}, {RESTAURANT.city}</p>
          {/* Le code de retrait n'est jamais affiché ici (la page s'ouvre avec la seule référence) */}
          <p className="muted"><Rich text={T.pickupCode} /></p>
          <a className="btn btn-p" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">{t.common.directions}</a>
        </div>
      );
    case 'LIVREE':
      return <p className="trk-now ok">{T.pickupDone}</p>;
    default:
      return null;
  }
}

function Now({ order }) {
  const t = useT();
  const T = t.tracking;
  const fee = order.deliveryFee;
  const feeDue = fee > 0 && !order.deliveryFeePaid; // 0 F : livraison offerte
  const toConfirm = order.deliveryFeeSource === 'A_CONFIRMER';
  const amount = formatPrice(order.itemsTotal);
  const checking = <Rich text={T.checking} amount={amount} />;
  // Frais déjà connus à la commande (grille du Patron) : annoncés dès la vérification du paiement
  const known = fee == null ? null : fee === 0 ? T.knownFree : <Rich text={T.knownFee} fee={formatPrice(fee)} night={order.deliveryNightFee > 0 ? `, ${t.fees.nightLine(order.deliveryNightFee)}` : ''} />;
  const preparing = order.status === 'EN_PREPARATION' ? T.preparing : T.paidWillPrepare;
  if (isPickup(order) && order.status !== 'ANNULEE') return <PickupNow order={order} />;
  // Livreurs indépendants : aucun montant de livraison, la phrase des indépendants à chaque étape avant la remise
  if (order.independentDelivery && ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON'].includes(order.status)) {
    const lead = order.status === 'PAIEMENT_A_VERIFIER' ? checking : order.status === 'EN_LIVRAISON' ? T.onTheWayCode : preparing;
    return <p className="trk-now">{lead} {t.fees.independent}</p>;
  }

  switch (order.status) {
    case 'ANNULEE':
      return (
        <p className="trk-now bad">
          {order.cancelReason ? <Rich text={T.reason} reason={order.cancelReason.trim().replace(/[\s.!]+$/, '')} /> : null}
          {T.contactUs}
        </p>
      );
    case 'PAIEMENT_A_VERIFIER':
      if (known) return <p className="trk-now">{checking}{known}</p>;
      if (toConfirm) return <p className="trk-now">{checking}{T.checkingToConfirm}</p>;
      return <p className="trk-now">{checking}{T.checkingLater}</p>;
    case 'PAYEE':
    case 'EN_PREPARATION':
      if (fee == null && toConfirm) return <p className="trk-now">{T.paidToConfirm}</p>;
      if (fee == null) return <p className="trk-now">{T.paidFeeLater}</p>;
      if (fee === 0) return <p className="trk-now ok">{preparing}{T.freeDelivery}</p>;
      if (feeDue) {
        return (
          <FeeToPay fee={fee} nightFee={order.deliveryNightFee} feePayment={order.feePayment}>
            <p className="trk-fee-lead">{preparing}</p>
          </FeeToPay>
        );
      }
      return <p className="trk-now ok"><Rich text={T.feeReceived} fee={formatPrice(fee)} />{order.status === 'EN_PREPARATION' ? T.preparing : T.willPrepare}</p>;
    case 'EN_LIVRAISON':
      if (feeDue) {
        return (
          <FeeToPay fee={fee} nightFee={order.deliveryNightFee} feePayment={order.feePayment}>
            <p className="trk-fee-lead">{T.onTheWayCode}</p>
          </FeeToPay>
        );
      }
      return <p className="trk-now ok">{T.onTheWay}{fee === 0 && T.onTheWayFree}</p>;
    case 'LIVREE':
      return <p className="trk-now ok">{T.delivered}</p>;
    default:
      return null;
  }
}
