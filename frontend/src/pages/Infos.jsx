import { DIRECTIONS_URL, HOURS, RESTAURANT, telHref, whatsappHref } from '../restaurant.js';
import { PageHead } from '../components/PageParts.jsx';

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
            <p>Nous livrons à domicile et au bureau. Les frais dépendent de votre quartier : une fois votre paiement vérifié, notre équipe vous indique leur montant sur WhatsApp et sur la page de suivi de votre commande. Vous les payez au livreur à la réception, en espèces ou par Orange Money / Moov Money. Vous pouvez aussi retirer votre commande au restaurant.</p>
          </div>
          <div className="info-card">
            <h3>Paiement</h3>
            <p style={{ marginBottom: 10 }}>Le paiement se fait avant la livraison, par Orange Money ou Moov Money. Envoyez le montant de votre commande, puis indiquez le numéro qui a payé.</p>
            <dl><dt>Orange Money</dt><dd>{RESTAURANT.orangeMoney}</dd><dt>Moov Money</dt><dd>{RESTAURANT.moovMoney}</dd></dl>
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
