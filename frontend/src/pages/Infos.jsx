import { MERCHANT, WHATSAPP } from '../components/Layout.jsx';
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
            <p>Nous livrons à domicile et au bureau. Les frais et le délai dépendent de votre quartier : notre équipe vous les annonce sur WhatsApp. Vous pouvez aussi retirer votre commande au restaurant.</p>
          </div>
          <div className="info-card">
            <h3>Paiement</h3>
            <p style={{ marginBottom: 10 }}>Le paiement se fait avant la livraison, par Orange Money ou Moov Money. Envoyez le montant de votre commande, puis indiquez le numéro qui a payé.</p>
            <dl><dt>Orange Money</dt><dd>{MERCHANT}</dd><dt>Moov Money</dt><dd>{MERCHANT}</dd></dl>
          </div>
          <div className="info-card">
            <h3>Horaires</h3>
            <dl><dt>Lundi – jeudi</dt><dd>11 h – 23 h</dd><dt>Vendredi – samedi</dt><dd>11 h – minuit</dd><dt>Dimanche</dt><dd>16 h – 23 h</dd></dl>
          </div>
          <div className="info-card">
            <h3>Contact</h3>
            <dl><dt>WhatsApp</dt><dd>{WHATSAPP}</dd><dt>Adresse</dt><dd>À compléter</dd></dl>
          </div>
        </div>
      </div>
    </>
  );
}
