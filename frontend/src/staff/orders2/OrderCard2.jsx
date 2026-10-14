import { Link } from 'react-router-dom';
import { formatPrice } from '../../utils/format.js';
import { FEE_METHOD_LABEL, feeText, formatTime, isIndependent, isPartner, isPickup, METHOD_LABEL, statusLabel } from '../orders/labels.js';
import { shortLabel, waitLevel, waitMinutes, waitText } from './waiting.js';

// Ce qui compte pour l'étape (même texte que la page actuelle, OrdersList.jsx, qui ne change pas)
export function stageDetail(o) {
  if (isPickup(o)) {
    if (o.status === 'PRETE') return 'Le client vient la retirer';
    if (o.status === 'LIVREE') return 'Retirée au comptoir';
    return 'À emporter · sans frais';
  }
  // Livreur indépendant : aucun frais dans la commande
  if (isIndependent(o) && ['PAIEMENT_A_VERIFIER', 'PAYEE'].includes(o.status)) return `${o.deliveryZoneName ? `${o.deliveryZoneName} · ` : ''}livreur indépendant`;
  if (o.status === 'PAIEMENT_A_VERIFIER') {
    if (o.deliveryFeeSource === 'A_CONFIRMER') return 'Frais à confirmer au téléphone';
    if (o.deliveryFee != null) return `${o.deliveryZoneName ? `${o.deliveryZoneName} · ` : ''}frais ${feeText(o.deliveryFee)}`;
    return null;
  }
  if (o.status === 'PAYEE') {
    if (o.deliveryFee == null) return 'Frais à saisir';
    return o.deliveryFee === 0 ? 'Livraison offerte' : `Frais ${formatPrice(o.deliveryFee)} au livreur`;
  }
  // Textes courts : le nom du livreur doit rester lisible dans une carte étroite
  if (isPartner(o) && o.status === 'EN_PREPARATION') return o.courierName ? `🛵 ${o.courierName}` : 'Livreur à choisir';
  if (o.status === 'PRETE_LIVRAISON') return o.courierName ? `🛵 ${o.courierName} arrive` : 'En attente d’un livreur';
  if (o.status === 'EN_LIVRAISON') return o.courierName ? `🛵 ${o.courierName}` : 'Livreur non indiqué';
  if (o.status === 'LIVREE') return [o.courierName ? `Livrée par ${o.courierName}` : 'Livrée', o.deliveryFeeMethod && `frais ${FEE_METHOD_LABEL[o.deliveryFeeMethod]}`].filter(Boolean).join(' · ');
  if (isPickup(o) || !o.deliveryZoneName) return null;
  return o.deliveryZoneName;
}

const LEVEL_TEXT = { warn: 'à surveiller', late: 'en retard' };
const shortMethod = (m) => (METHOD_LABEL[m] || '').split(' ')[0];

// Lot 12 : carte compacte sur 2 lignes. Ligne 1 : référence, client, badges, temps d'attente à l'étape.
// Ligne 2 : quartier ou livreur, total et paiement. Bord gauche et pastille : normal, orange ou rouge.
// withStatus : historique et recherche (statut à la place du temps d'attente).
// stage : onglet « Tout » (téléphone, tablette), l'étape de la commande au-dessus de la carte.
export default function OrderCard2({ order: o, isNew, withStatus = false, now, stage }) {
  const level = withStatus ? null : waitLevel(o, now);
  const min = waitMinutes(o, now);
  const detail = stageDetail(o);
  const since = formatTime(o.stageSince || o.createdAt);
  return (
    <li>
      {stage && <span className={`c2-stage s-${stage.id}`}>{shortLabel(stage)}</span>}
      <Link to={`/equipe/commandes/${o.reference}`} className={`c2 s-${o.status}${level ? ` lvl-${level}` : ''}`}>
        <span className="c2-l1">
          <b className="c2-ref">{o.reference}</b>
          <span className="c2-name">{o.customerName}</span>
          {isNew && <span className="c2-badge new">Nouvelle</span>}
          {o.status === 'PRETE_LIVRAISON' && <span className="c2-badge ready">Prête</span>}
          {!withStatus && o.noticePending && (
            <span className="c2-badge msg" title="Message au client à confirmer avant l’étape suivante">
              <span aria-hidden="true">✉</span><span className="sr">Message au client à confirmer</span>
            </span>
          )}
          {withStatus ? (
            <span className={`st-pill p-${o.status}`}>{statusLabel(o)}</span>
          ) : (
            <span className={`c2-wait w-${level}`} title={`À cette étape depuis ${since}${LEVEL_TEXT[level] ? ` (${LEVEL_TEXT[level]})` : ''}`}>
              {waitText(min)}
            </span>
          )}
        </span>
        <span className="c2-l2">
          <span className="c2-detail">{detail || (withStatus ? formatTime(o.createdAt) : '')}</span>
          <span className="c2-sum">{o.itemCount} art. · <b>{formatPrice(o.itemsTotal)}</b> · {shortMethod(o.paymentMethod)}</span>
        </span>
      </Link>
    </li>
  );
}
