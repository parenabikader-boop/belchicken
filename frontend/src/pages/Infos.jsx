import { DIRECTIONS_URL, RESTAURANT, telHref, whatsappHref } from '../restaurant.js';
import { PageHead } from '../components/PageParts.jsx';
import { usePaymentCodes } from '../utils/payment.js';
import { Rich, useT } from '../i18n/index.jsx';

// Codes marchands des 3 opérateurs (réglages du serveur), « montant » à la place du montant
function PaymentCodes() {
  const { data } = usePaymentCodes();
  const { infos: I } = useT();
  if (!data) return null;
  return (
    <>
      <dl>
        {data.operators.flatMap((op) => [
          <dt key={`${op.method}-l`}>{op.label}</dt>,
          <dd key={`${op.method}-c`}><code className="code-ussd">{op.code.replaceAll('MONTANT', I.amountWord)}</code></dd>,
        ])}
      </dl>
      <p className="muted info-merchant"><Rich text={I.merchant} merchant={data.merchantName} /></p>
    </>
  );
}

export default function Infos() {
  const t = useT();
  const I = t.infos;
  return (
    <>
      <PageHead crumbs={[{ label: t.layout.home, to: '/' }, { label: I.title }]} title={I.title}>
        {I.lead}
      </PageHead>
      <div className="wrap pagebody">
        <div className="info-grid">
          <div className="info-card">
            <h3>{I.delivery}</h3>
            <p>{I.deliveryText}</p>
          </div>
          <div className="info-card">
            <h3>{I.payment}</h3>
            <p style={{ marginBottom: 10 }}>{I.paymentText}</p>
            <PaymentCodes />
          </div>
          <div className="info-card">
            <h3>{I.hours}</h3>
            <dl>{t.restaurant.hours.flatMap((h) => [<dt key={`${h.days}-j`}>{h.days}</dt>, <dd key={`${h.days}-h`}>{h.time}</dd>])}</dl>
          </div>
          <div className="info-card">
            <h3>{I.contact}</h3>
            <dl>
              <dt>{I.restaurant}</dt><dd><a href={telHref(RESTAURANT.phone)}>{RESTAURANT.phone}</a></dd>
              <dt>{I.whatsapp}</dt><dd><a href={whatsappHref(RESTAURANT.whatsapp)} target="_blank" rel="noreferrer">{RESTAURANT.whatsapp}</a><br /><small className="muted">{I.whatsappSub}</small></dd>
              <dt>{I.address}</dt><dd>{t.restaurant.address}, {RESTAURANT.city}</dd>
              <dt>{I.plusCode}</dt><dd>{RESTAURANT.plusCode}</dd>
            </dl>
            <a className="btn btn-s info-route" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">{t.common.directions}</a>
          </div>
        </div>
      </div>
    </>
  );
}
