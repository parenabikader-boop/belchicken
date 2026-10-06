import { DIRECTIONS_URL, HOURS, RESTAURANT, telHref, whatsappHref } from '../restaurant.js';
import { PageHead } from '../components/PageParts.jsx';
import { usePaymentCodes } from '../utils/payment.js';

// Codes marchands des 3 opérateurs (réglages du serveur), « montant » à la place du montant
function PaymentCodes() {
  const { data } = usePaymentCodes();
  if (!data) return null;
  return (
    <>
      <dl>
        {data.operators.flatMap((op) => [
          <dt key={`${op.method}-l`}>{op.label}</dt>,
          <dd key={`${op.method}-c`}><code className="code-ussd">{op.code.replaceAll('MONTANT', 'montant')}</code></dd>,
        ])}
      </dl>
      <p className="muted info-merchant">Nom affiché sur votre confirmation : <b>{data.merchantName}</b>, le compte de Belchicken. Paiement sans frais.</p>
    </>
  );
}

export default function Infos() {
  return (
    <>
      <PageHead crumbs={[{ label: 'Accueil', to: '/' }, { label: 'Infos pratiques' }]} title="Infos pratiques">
        Livraison, paiement, horaires et contact.
      </PageHead>
      <div className="wrap pagebody">
        <div className="info-grid">
          <div className="info-card">
            <h3>Livraison</h3>
            <p>Nous livrons à domicile et au bureau. Les frais dépendent de votre quartier : une fois votre paiement vérifié, notre équipe vous indique leur montant sur WhatsApp et sur la page de suivi de votre commande. Vous les payez au livreur à la réception, en espèces ou par mobile money avec le code marchand. Vous pouvez aussi retirer votre commande au restaurant.</p>
          </div>
          <div className="info-card">
            <h3>Paiement</h3>
            <p style={{ marginBottom: 10 }}>
              Le paiement se fait avant la livraison, par Orange Money, Moov Money ou Telecel Money, avec le code marchand.
              Au moment de commander, le code s’affiche avec le montant déjà rempli : il suffit de le composer, puis d’indiquer le numéro qui a payé.
            </p>
            <PaymentCodes />
          </div>
          <div className="info-card">
            <h3>Horaires</h3>
            <dl>{HOURS.flatMap((h) => [<dt key={`${h.days}-j`}>{h.days}</dt>, <dd key={`${h.days}-h`}>{h.time}</dd>])}</dl>
          </div>
          <div className="info-card">
            <h3>Contact</h3>
            <dl>
              <dt>Restaurant</dt><dd><a href={telHref(RESTAURANT.phone)}>{RESTAURANT.phone}</a></dd>
              <dt>WhatsApp</dt><dd><a href={whatsappHref(RESTAURANT.whatsapp)} target="_blank" rel="noreferrer">{RESTAURANT.whatsapp}</a><br /><small className="muted">Commandes et suivi</small></dd>
              <dt>Adresse</dt><dd>{RESTAURANT.address}, {RESTAURANT.city}</dd>
              <dt>Plus Code</dt><dd>{RESTAURANT.plusCode}</dd>
            </dl>
            <a className="btn btn-s info-route" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">Itinéraire</a>
          </div>
        </div>
      </div>
    </>
  );
}
