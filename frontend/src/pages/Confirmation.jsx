import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { WHATSAPP } from '../components/Layout.jsx';
import { TunnelHead } from '../components/PageParts.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../utils/format.js';

const METHOD_LABEL = { ORANGE_MONEY: 'Orange Money', MOOV_MONEY: 'Moov Money' };
const STATUS_LABEL = {
  PAIEMENT_A_VERIFIER: 'Paiement en cours de vérification',
  PAYEE: 'Paiement reçu',
  EN_PREPARATION: 'En préparation',
  EN_LIVRAISON: 'En livraison',
  LIVREE: 'Livrée',
  ANNULEE: 'Annulée',
};

const formatDate = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

// Juste après l'envoi, la page reçoit la commande et les coordonnées du client (state de navigation).
// Après un rechargement, elle relit la commande via GET /api/orders/:reference, qui ne renvoie
// ni le nom, ni les numéros, ni la position : ces lignes sont alors simplement absentes.
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

  useEffect(() => {
    if (fresh) return undefined;
    let alive = true;
    api.getOrder(reference).then(
      (o) => alive && setOrder(o),
      (e) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [reference, fresh]);

  if (error) {
    return (
      <div className="wrap pagebody tunnel-body">
        <TunnelHead title="Confirmation" />
        <div className="alert err" role="alert"><span>{error.message}</span></div>
        <Link className="lnk" to="/menu">‹ Retour au menu</Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="wrap pagebody tunnel-body">
        <TunnelHead title="Confirmation" />
        <div className="alert info" role="status"><span>Chargement de votre commande…</span></div>
      </div>
    );
  }

  const recap = fresh?.recap;
  const delivery = recap && [recap.geo && 'Position partagée', recap.addr].filter(Boolean).join(' · ');

  return (
    <div className="wrap pagebody tunnel-body">
      <TunnelHead title="Commande envoyée" step={3}>
        {recap ? `Notre équipe vous contacte sur WhatsApp au ${recap.phone}.` : `Notre équipe vous contacte sur WhatsApp. Une question : ${WHATSAPP}.`}
      </TunnelHead>
      <div className="receipt">
        <div className="alert info" style={{ marginBottom: 18 }}>
          <span>Votre commande est préparée dès que le paiement est vérifié. Les frais de livraison vous sont annoncés sur WhatsApp.</span>
        </div>
        <div className="doc">
          <div className="doc-top">
            <div className="brand"><span className="mark"><span>B</span></span><span><b>Belchicken</b><small>Récapitulatif de commande</small></span></div>
            <div className="ref"><span>Référence</span><b>{order.reference}</b><span>{formatDate(order.createdAt)}</span></div>
          </div>
          <table>
            <thead><tr><th>Désignation</th><th className="r">Qté</th><th className="r">Montant</th></tr></thead>
            <tbody>
              {order.items.map((i, k) => {
                const details = [i.variantLabel, i.choice, i.note].filter(Boolean).join(' · ');
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
              <tr className="tot"><td>Total des plats</td><td></td><td className="r">{formatPrice(order.itemsTotal)}</td></tr>
            </tbody>
          </table>
          <dl>
            {recap && <><dt>Client</dt><dd>{recap.name} · {recap.phone}</dd></>}
            <dt>Paiement</dt>
            <dd>{METHOD_LABEL[order.paymentMethod] || order.paymentMethod}{recap && ` · depuis le ${recap.payer}`}</dd>
            {delivery && <><dt>Livraison</dt><dd>{delivery}</dd></>}
            <dt>Frais de livraison</dt><dd>Annoncés sur WhatsApp</dd>
            <dt>Statut</dt><dd><span className="pill">{STATUS_LABEL[order.status] || order.status}</span></dd>
          </dl>
        </div>
        <div className="rc-actions">
          <button type="button" className="btn btn-s" onClick={() => window.print()}>Imprimer</button>
          <Link className="btn btn-p" to="/menu">Retour au menu</Link>
        </div>
      </div>
    </div>
  );
}
