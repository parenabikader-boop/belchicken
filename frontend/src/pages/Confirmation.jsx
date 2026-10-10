import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { WHATSAPP } from '../components/Layout.jsx';
import { DIRECTIONS_URL, RESTAURANT, whatsappHref } from '../restaurant.js';
import PayCode from '../components/PayCode.jsx';
import { drinksLabel } from '../utils/drinks.js';
import { METHOD_LABEL } from '../utils/payment.js';
import { TunnelHead } from '../components/PageParts.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';
import { feeLabel, nightLine } from '../utils/deliveryFee.js';

// Rafraîchissement de la page de suivi, tant que la commande n'est ni livrée ni annulée
const REFRESH_MS = 20000;
const FINAL = ['LIVREE', 'ANNULEE'];

// Frise : les étapes vues par le client (livraison, ou à emporter avec « Prête » et « Retirée »)
const DELIVERY_STEPS = [
  { status: 'PAIEMENT_A_VERIFIER', label: 'Commande reçue' },
  { status: 'PAYEE', label: 'Paiement vérifié' },
  { status: 'EN_PREPARATION', label: 'En préparation' },
  { status: 'EN_LIVRAISON', label: 'En route' },
  { status: 'LIVREE', label: 'Livrée' },
];
const PICKUP_STEPS = [
  ...DELIVERY_STEPS.slice(0, 3),
  { status: 'PRETE', label: 'Prête à retirer' },
  { status: 'LIVREE', label: 'Retirée' },
];
const isPickup = (order) => order.mode === 'A_EMPORTER';

const formatDate = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${formatTime(iso)}`;
};
const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
        <TunnelHead title="Suivi de commande" />
        {error ? (
          <>
            <div className="alert err" role="alert"><span>{error.message}</span></div>
            <Link className="lnk" to="/menu">‹ Retour au menu</Link>
          </>
        ) : (
          <div className="alert info" role="status"><span>Chargement de votre commande…</span></div>
        )}
      </div>
    );
  }

  const recap = fresh?.recap;
  const pickup = isPickup(order);
  // Quartier choisi (copié dans la commande, visible aussi sans le récapitulatif), position, repères
  const delivery = !pickup && [order.deliveryZoneName, recap?.geo && 'Position partagée', recap?.addr].filter(Boolean).join(' · ');
  const toConfirm = order.deliveryFeeSource === 'A_CONFIRMER';
  const fee = order.deliveryFee;

  return (
    <div className="wrap pagebody tunnel-body">
      <TunnelHead title={fresh ? 'Commande envoyée' : 'Suivi de commande'} step={fresh ? 3 : undefined}>
        {recap
          ? `Gardez cette page : elle suit votre commande en direct. Nous vous écrivons aussi sur WhatsApp au ${recap.phone}.`
          : `Commande ${order.reference}. Cette page se met à jour toute seule.`}
      </TunnelHead>
      <div className="receipt">
        <Tracking order={order} offline={Boolean(error)} />

        <div className="doc">
          <div className="doc-top">
            <div className="brand"><span className="mark"><span>B</span></span><span><b>Belchicken</b><small>Récapitulatif de commande</small></span></div>
            <div className="ref"><span>Référence</span><b>{order.reference}</b><span>{formatDate(order.createdAt)}</span></div>
          </div>
          <table>
            <thead><tr><th>Désignation</th><th className="r">Qté</th><th className="r">Montant</th></tr></thead>
            <tbody>
              {order.items.map((i, k) => {
                const details = [i.variantLabel, i.choice, drinksLabel(i.drinks, i.quantity), i.note].filter(Boolean).join(' · ');
                return (
                  <tr key={k}>
                    <td>
                      {i.productNumber != null && `N° ${i.productNumber} · `}{i.productName}
                      {details && <div className="muted" style={{ fontSize: 12 }}>{details}</div>}
                    </td>
                    <td className="r">{i.quantity}</td>
                    <td className="r">{formatPrice(i.lineTotal)}</td>
                  </tr>
                );
              })}
              <tr className={fee != null ? 'sub' : 'tot'}><td>Total des plats</td><td></td><td className="r">{formatPrice(order.itemsTotal)}</td></tr>
              {fee != null && (
                <>
                  <tr className="sub"><td>Frais de livraison{order.deliveryNightFee > 0 && <small className="trk-night">{nightLine(order.deliveryNightFee)}</small>}</td><td></td><td className="r">{feeLabel(fee)}</td></tr>
                  <tr className="tot"><td>Total</td><td></td><td className="r">{formatPrice(order.itemsTotal + fee)}</td></tr>
                </>
              )}
            </tbody>
          </table>
          <dl>
            {recap && <><dt>Client</dt><dd>{recap.name} · {recap.phone}</dd></>}
            <dt>Paiement</dt>
            <dd>{METHOD_LABEL[order.paymentMethod] || order.paymentMethod}{recap && ` · depuis le ${recap.payer}`}</dd>
            {delivery && <><dt>Livraison</dt><dd>{delivery}</dd></>}
            {pickup && <><dt>À emporter</dt><dd>Retrait au restaurant, {RESTAURANT.address} · sans frais de livraison</dd></>}
            {!pickup && (fee != null || order.status !== 'ANNULEE') && (
              <>
                <dt>Frais de livraison</dt>
                <dd>
                  {fee == null
                    ? toConfirm
                      ? 'À confirmer par notre équipe au téléphone, puis affichés ici'
                      : 'Selon votre quartier : affichés ici après la vérification de votre paiement'
                    : fee === 0
                      ? 'Livraison offerte : rien à payer au livreur'
                      : `${formatPrice(fee)}${order.deliveryNightFee > 0 ? `, ${nightLine(order.deliveryNightFee)}` : ''} · ${order.deliveryFeePaid ? 'payés, merci' : 'à payer au livreur à la réception'}`}
                </dd>
              </>
            )}
          </dl>
        </div>
        <div className="rc-actions">
          <a className="btn btn-wa" href={contactHref(order.reference)} target="_blank" rel="noreferrer">Nous contacter sur WhatsApp</a>
          <button type="button" className="btn btn-s" onClick={() => window.print()}>Imprimer</button>
          <Link className="btn btn-s" to="/menu">Retour au menu</Link>
        </div>
      </div>
    </div>
  );
}

// Où en est la commande : frise des étapes et ce que le client doit savoir maintenant
function Tracking({ order, offline }) {
  const STEPS = isPickup(order) ? PICKUP_STEPS : DELIVERY_STEPS;
  const cancelled = order.status === 'ANNULEE';
  const at = Object.fromEntries((order.steps || []).map((s) => [s.status, s.at]));
  at.PAIEMENT_A_VERIFIER ??= order.createdAt;
  // Étape atteinte : la dernière de la frise (pour une commande annulée, la dernière avant l'annulation)
  const reached = cancelled
    ? Math.max(0, ...STEPS.map((s, i) => (at[s.status] ? i : 0)))
    : STEPS.findIndex((s) => s.status === order.status);

  return (
    <section className={`trk${cancelled ? ' off' : ''}`} aria-label="Suivi de votre commande">
      <div className="trk-head">
        <h2>{cancelled ? 'Commande annulée' : STEPS[reached].label}</h2>
        {!FINAL.includes(order.status) && (
          <span className={`trk-live${offline ? ' off' : ''}`}>{offline ? 'Connexion perdue, nouvel essai…' : 'Mise à jour automatique'}</span>
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
              <b>{s.label}</b>
              <small>{at[s.status] && state !== 'todo' ? formatTime(at[s.status]) : ' '}</small>
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
  // feePayment : codes avec le montant des frais, donnés par le serveur (les mêmes que dans les messages WhatsApp)
  return (
    <div className="trk-fee">
      {children}
      <p>Frais de livraison</p>
      <b>{formatPrice(fee)}</b>
      {nightFee > 0 && <p className="trk-night">{nightLine(nightFee)}</p>}
      <p>À payer au livreur à la réception, en espèces ou par mobile money avec le code marchand :</p>
      {feePayment && (
        <>
          <div className="trk-codes">
            {feePayment.operators.map((op) => <PayCode key={op.method} label={op.label} code={op.code} compact />)}
          </div>
          <p className="trk-merchant">
            Votre confirmation affichera le nom <b>{feePayment.merchantName}</b> :{' '}
            {/* Lot 5 : en mode Prestataire, les frais vont à notre partenaire de livraison (nom affiché = notre société) */}
            {feePayment.operator === 'PRESTATAIRE' ? 'c’est bien le compte de notre partenaire de livraison' : 'c’est bien le compte de Belchicken'}. Paiement sans frais.
          </p>
        </>
      )}
    </div>
  );
}

// À emporter : pas de frais, l'adresse du restaurant quand la commande est prête
function PickupNow({ order }) {
  switch (order.status) {
    case 'PAIEMENT_A_VERIFIER':
      return <p className="trk-now">Nous vérifions votre paiement de <b>{formatPrice(order.itemsTotal)}</b> sur notre téléphone marchand. Nous vous écrivons sur WhatsApp dès que votre commande est prête.</p>;
    case 'PAYEE':
      return <p className="trk-now ok">Paiement vérifié, merci ! Votre commande va être préparée. Nous vous écrivons dès qu’elle est prête à retirer.</p>;
    case 'EN_PREPARATION':
      return <p className="trk-now">Votre commande est en préparation. Nous vous écrivons sur WhatsApp dès qu’elle est prête à retirer.</p>;
    case 'PRETE':
      return (
        <div className="trk-ready">
          <p className="trk-fee-lead">Votre commande est prête ! Venez la retirer au restaurant.</p>
          <p><b>{RESTAURANT.name}</b><br />{RESTAURANT.address}, {RESTAURANT.city}</p>
          {/* Le code de retrait n'est jamais affiché ici (la page s'ouvre avec la seule référence) */}
          <p className="muted">Au comptoir, donnez le <b>code de retrait à 4 chiffres</b> reçu sur WhatsApp dans le message « commande prête ».</p>
          <a className="btn btn-p" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">Itinéraire</a>
        </div>
      );
    case 'LIVREE':
      return <p className="trk-now ok">Commande retirée. Merci de votre confiance et bon appétit !</p>;
    default:
      return null;
  }
}

function Now({ order }) {
  const fee = order.deliveryFee;
  const feeDue = fee > 0 && !order.deliveryFeePaid; // 0 F : livraison offerte
  const toConfirm = order.deliveryFeeSource === 'A_CONFIRMER';
  // Frais déjà connus à la commande (grille du Patron) : annoncés dès la vérification du paiement
  const known = fee == null ? null : fee === 0 ? <> Livraison offerte : rien à payer au livreur.</> : <> Frais de livraison : <b>{formatPrice(fee)}</b>{order.deliveryNightFee > 0 && `, ${nightLine(order.deliveryNightFee)}`}, à payer au livreur à la réception.</>;
  if (isPickup(order) && order.status !== 'ANNULEE') return <PickupNow order={order} />;

  switch (order.status) {
    case 'ANNULEE':
      return (
        <p className="trk-now bad">
          {order.cancelReason ? <>Motif : <b>{order.cancelReason.trim().replace(/[\s.!]+$/, '')}</b>. </> : null}
          Pour toute question, contactez-nous sur WhatsApp.
        </p>
      );
    case 'PAIEMENT_A_VERIFIER':
      if (known) return <p className="trk-now">Nous vérifions votre paiement de <b>{formatPrice(order.itemsTotal)}</b> sur notre téléphone marchand.{known}</p>;
      if (toConfirm) return <p className="trk-now">Nous vérifions votre paiement de <b>{formatPrice(order.itemsTotal)}</b> sur notre téléphone marchand. Notre équipe vous appelle pour confirmer les frais de livraison.</p>;
      return <p className="trk-now">Nous vérifions votre paiement de <b>{formatPrice(order.itemsTotal)}</b> sur notre téléphone marchand. Ensuite, nous vous indiquons ici et sur WhatsApp les frais de livraison pour votre quartier.</p>;
    case 'PAYEE':
    case 'EN_PREPARATION':
      if (fee == null && toConfirm) return <p className="trk-now">Paiement vérifié, merci ! Notre équipe vous appelle pour confirmer les frais de livraison : ils s’affichent ensuite ici.</p>;
      if (fee == null) return <p className="trk-now">Paiement vérifié, merci ! Nous calculons les frais de livraison pour votre quartier : ils s’affichent ici dans un instant et vous sont envoyés sur WhatsApp.</p>;
      if (fee === 0) return <p className="trk-now ok">{order.status === 'EN_PREPARATION' ? 'Votre commande est en préparation.' : 'Paiement vérifié, merci ! Votre commande va être préparée.'} Livraison offerte : rien à payer au livreur.</p>;
      if (feeDue) {
        return (
          <FeeToPay fee={fee} nightFee={order.deliveryNightFee} feePayment={order.feePayment}>
            <p className="trk-fee-lead">{order.status === 'EN_PREPARATION' ? 'Votre commande est en préparation.' : 'Paiement vérifié, merci ! Votre commande va être préparée.'}</p>
          </FeeToPay>
        );
      }
      return <p className="trk-now ok">Frais de livraison de <b>{formatPrice(fee)}</b> bien reçus. {order.status === 'EN_PREPARATION' ? 'Votre commande est en préparation.' : 'Votre commande va être préparée.'}</p>;
    case 'EN_LIVRAISON':
      if (feeDue) {
        return (
          <FeeToPay fee={fee} nightFee={order.deliveryNightFee} feePayment={order.feePayment}>
            <p className="trk-fee-lead">Votre commande est en route ! Gardez votre téléphone près de vous : le livreur peut vous appeler. Donnez-lui le code reçu sur WhatsApp.</p>
          </FeeToPay>
        );
      }
      return <p className="trk-now ok">Votre commande est en route ! Gardez votre téléphone près de vous : le livreur peut vous appeler.{fee === 0 && ' Livraison offerte : rien à payer au livreur. Donnez-lui le code reçu sur WhatsApp.'}</p>;
    case 'LIVREE':
      return <p className="trk-now ok">Commande livrée. Merci de votre confiance et bon appétit !</p>;
    default:
      return null;
  }
}
