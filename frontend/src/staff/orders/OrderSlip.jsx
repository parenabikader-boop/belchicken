import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api/client.js';
import { drinksLabel } from '../../utils/drinks.js';
import { formatPrice } from '../../utils/format.js';
import { feeText, formatDateTime, formatPhone, formatTime, isPickup, METHOD_LABEL } from './labels.js';

// Bon de commande imprimable depuis le navigateur : ticket 80 mm ou A4. Il passe d'abord par la caisse, qui
// vérifie : prix de chaque ligne, total des plats, paiement (« PAYÉ – Orange Money » et le numéro qui a payé),
// frais de livraison à part. Jamais le code de remise ni le code de retrait (la feuille passe de main en main).

const FORMATS = [
  { id: '80', label: 'Ticket 80 mm', page: '@page{size:80mm auto;margin:3mm}' },
  { id: 'a4', label: 'A4', page: '@page{size:A4;margin:14mm}' },
];
const PAID = ['PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'PRETE', 'LIVREE'];
// Provenance de la commande : le site pour l'instant (prise de commande par l'agent : lot 2)
const SOURCE_LABEL = { SITE: 'Site' };

export default function OrderSlip() {
  const { reference } = useParams();
  const [search, setSearch] = useSearchParams();
  const format = FORMATS.find((f) => f.id === search.get('format')) || FORMATS[0];
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    staffApi.order(reference).then(setOrder, setError);
  }, [reference]);

  // Taille de page pour l'impression (une seule règle @page à la fois)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = format.page;
    document.head.appendChild(style);
    const title = document.title;
    document.title = `Bon ${reference.toUpperCase()}`;
    return () => {
      style.remove();
      document.title = title;
    };
  }, [format, reference]);

  return (
    <div className={`slip-page f-${format.id}`}>
      <div className="slip-bar">
        <Link className="st-back" to={`/equipe/commandes/${reference}`}>‹ Retour à la commande</Link>
        <div className="slip-formats" role="group" aria-label="Format du bon">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" className={f.id === format.id ? 'on' : ''} aria-pressed={f.id === format.id} onClick={() => setSearch({ format: f.id }, { replace: true })}>
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-p" onClick={() => window.print()} disabled={!order}>Imprimer</button>
      </div>
      {error && <div className="alert err" role="alert"><span>{error.message}</span></div>}
      {!order && !error && <p className="st-muted">Chargement du bon…</p>}
      {order && <Slip o={order} />}
    </div>
  );
}

function Slip({ o }) {
  const pickup = isPickup(o);
  const paid = PAID.includes(o.status);
  const verified = o.history.find((h) => h.toStatus === 'PAYEE');
  const items = o.items.map((i) => ({ ...i, details: [i.variantLabel, i.choice, drinksLabel(i.drinks, i.quantity)].filter(Boolean) }));

  return (
    <article className="slip">
      <header className="slip-head">
        <b className="slip-brand">BELCHICKEN BURKINA</b>
        <span className="slip-kind">Bon de commande</span>
        <b className="slip-ref">{o.reference}</b>
        <span>Reçue le {formatDateTime(o.createdAt)}</span>
        <span>Provenance : {SOURCE_LABEL[o.source] || 'Site'}</span>
      </header>

      <p className={`slip-mode${pickup ? ' slip-emp' : ''}`}>{pickup ? 'À EMPORTER' : 'LIVRAISON'}</p>
      {o.status === 'ANNULEE' && <p className="slip-alert">COMMANDE ANNULÉE : NE PAS PRÉPARER</p>}
      {o.status === 'PAIEMENT_A_VERIFIER' && <p className="slip-alert">PAIEMENT PAS ENCORE VÉRIFIÉ</p>}

      <section className="slip-sec">
        <p><b>{o.customerName}</b></p>
        <p>Tél. {formatPhone(o.customerPhone)}</p>
        {pickup ? (
          <p>Retrait au restaurant</p>
        ) : (
          <>
            {o.deliveryZoneName && <p>Quartier : <b>{o.deliveryZoneName}</b></p>}
            {o.addressNote && <p>Repères : {o.addressNote}</p>}
            {o.location && <p>Position GPS partagée par le client</p>}
          </>
        )}
      </section>

      <table className="slip-items">
        <tbody>
          {items.map((i, k) => (
            <tr key={k}>
              <td className="q">{i.quantity} ×</td>
              <td>
                <b>{i.productNumber != null && `N° ${i.productNumber} · `}{i.productName}</b>
                {i.details.map((d) => <span key={d} className="d">{d}</span>)}
                {i.note && <span className="d note">Note : {i.note}</span>}
                {i.quantity > 1 && <span className="d">{i.quantity} × {formatPrice(i.unitPrice)}</span>}
              </td>
              <td className="p">{formatPrice(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2}>Total des plats</td><td className="p">{formatPrice(o.itemsTotal)}</td></tr>
        </tfoot>
      </table>

      <div className={`slip-paid${paid ? '' : ' todo'}`}>
        <b>{paid ? `PAYÉ – ${METHOD_LABEL[o.paymentMethod]}` : `À VÉRIFIER – ${METHOD_LABEL[o.paymentMethod]}`}</b>
        <span>{formatPrice(o.itemsTotal)}{o.paymentPayerPhone && <> depuis le {formatPhone(o.paymentPayerPhone)}</>}</span>
        {paid && verified && <small>Vérifié par {verified.by} à {formatTime(verified.at)}</small>}
      </div>

      {!pickup && (
        <section className="slip-fee">
          <p>
            <span>Frais de livraison</span>
            <b>{o.deliveryFee == null ? 'À confirmer' : feeText(o.deliveryFee)}</b>
          </p>
          <small>
            {o.deliveryFee === 0
              ? 'Rien à payer au livreur.'
              : o.deliveryFee == null
                ? 'À confirmer avec le client.'
                : o.deliveryFeeMethod
                  ? 'Déjà payés.'
                  : 'À payer au livreur à la réception (à part).'}
          </small>
        </section>
      )}

      <footer className="slip-foot">Imprimé le {formatDateTime(new Date().toISOString())}</footer>
    </article>
  );
}
