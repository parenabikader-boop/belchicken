import { useEffect, useState } from 'react';
import { staffApi } from '../../api/client.js';
import { formatPrice } from '../../utils/format.js';
import { formatDateTime, formatPhone } from '../orders/labels.js';

// Plan 2 : paiement du repas validé automatiquement (interrupteurs PAIEMENT_AUTO_SMS, PAIEMENT_SMS_ESSAI
// et PAIEMENT_LIGDICASH, indépendants). Réglages visibles (clé de
// l'application Android, Ligdicash), formats des SMS, « Tester un SMS » (rien n'est enregistré ni validé) et journal.
const STATUS = {
  VALIDEE: 'Commande validée',
  AUCUNE: 'Aucune commande (pas encore passée ?)',
  DOUTE: 'Doute : à vérifier par l’équipe',
  FRAIS_MANQUANTS: 'Reconnu : frais de livraison à saisir',
  ILLISIBLE: 'SMS illisible',
  FORMAT_A_VERIFIER: 'Format pas encore vérifié',
  EN_ATTENTE: 'Ligdicash : en attente',
};

function TestSms({ formats }) {
  const [sender, setSender] = useState(formats[0]?.senders[0] || '');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const run = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setResult(await staffApi.testPaymentSms(sender, text));
    } catch (err) {
      setError(err.message);
      setResult(null);
    }
  };
  return (
    <form className="ap-test" onSubmit={run}>
      <h3>Tester un SMS</h3>
      <p className="st-muted">Collez un SMS reçu sur le téléphone marchand : la page dit ce qu’elle y lit. Rien n’est enregistré ni validé.</p>
      <div className="fields">
        <div className="f">
          <label htmlFor="ap-sender">Expéditeur (tel qu’affiché sur le téléphone)</label>
          <input id="ap-sender" value={sender} onChange={(e) => setSender(e.target.value)} maxLength={60} />
        </div>
      </div>
      <label htmlFor="ap-text" className="st-fee-label">Texte du SMS</label>
      <textarea id="ap-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={4} />
      <div className="st-action-row"><button type="submit" className="btn btn-p" disabled={!sender.trim() || !text.trim()}>Lire ce SMS</button></div>
      {error && <p className="st-err" role="alert">{error}</p>}
      {result && (
        <div className="ap-result" role="status">
          {result.ignored ? (
            <p><b>Expéditeur non reconnu</b> : ce SMS serait ignoré (seuls les expéditeurs officiels comptent).</p>
          ) : result.ok ? (
            <p>
              <b>{result.label}</b> : {formatPrice(result.amount)} reçus du {formatPhone(result.phone)}
              {result.txid && <>, transaction {result.txid}</>}.
              {result.supposed && <> <b>Format pas encore vérifié</b> : aucune commande ne serait validée.</>}
              {result.trial && !result.trialOpen && <> <b>Format d’essai</b> : il ne compte que si l’interrupteur « Formats SMS d’essai » est ouvert.</>}
              {!result.supposed && !result.smsOpen && <> Interrupteur « Paiement automatique par SMS » fermé : aucune commande ne serait validée.</>}
            </p>
          ) : (
            <p><b>{result.label}</b> : non lu. {result.reason}</p>
          )}
          {result.formatsError && <p className="st-err">{result.formatsError}</p>}
        </div>
      )}
    </form>
  );
}

export default function AutoPayments() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    staffApi.autoPayments().then(setData, (e) => setError(e.message));
  }, []);
  return (
    <section className="st-box pr-sec ap">
      <h2>Paiement du repas validé automatiquement</h2>
      {error && <p className="st-err" role="alert">{error}</p>}
      {!data && !error && <p className="st-muted">Chargement…</p>}
      {data && (
        <>
          <ul className="ap-state">
            <li>Interrupteur « Paiement automatique par SMS » : <b>{data.smsOpen ? 'ouvert' : 'fermé'}</b></li>
            <li>Interrupteur « Formats SMS d’essai » : <b>{data.trialOpen ? 'ouvert' : 'fermé'}</b></li>
            <li>Interrupteur « Paiement en ligne Ligdicash » : <b>{data.ligdicashOpen ? 'ouvert' : 'fermé'}</b></li>
            {!data.open && <li>Les deux fermés : le call center vérifie chaque paiement à la main, comme avant.</li>}
            <li>Clé de l’application Android (SMS_PAIEMENT_CLE) : <b>{data.smsKeySet ? 'réglée' : 'pas encore réglée'}</b></li>
            <li>Ligdicash : <b>{data.ligdicashSet ? 'identifiants réglés' : 'pas encore (contrat à signer)'}</b></li>
          </ul>
          {data.formatsError && <p className="st-err">{data.formatsError}</p>}
          <h3>Formats des SMS</h3>
          <ul className="ap-formats">
            {data.formats.map((f) => (
              <li key={f.label}>
                <b>{f.label}</b> · expéditeurs : {f.senders.join(', ')}
                {f.supposed ? <span className="ap-tag">supposé : ne valide rien</span> : <span className="ap-tag ok">vérifié</span>}
                {f.trial && <span className="ap-tag">essai : {data.trialOpen ? 'compte' : 'ignoré (interrupteur fermé)'}</span>}
              </li>
            ))}
          </ul>
          <TestSms formats={data.formats} />
          {data.open && (
            <>
              <h3>Derniers paiements reçus</h3>
              {data.recent.length === 0 ? <p className="st-muted">Aucun pour l’instant.</p> : (
                <ul className="ap-list">
                  {data.recent.map((p) => (
                    <li key={p.id} className={`ap-row ${p.status === 'VALIDEE' ? 'ok' : p.status === 'DOUTE' ? 'bad' : ''}`}>
                      <span>
                        <b>{STATUS[p.status] || p.status}</b>
                        {p.reference && <> · {p.reference}</>}
                        {p.amount != null && <> · {formatPrice(p.amount)}</>}
                        {p.payerPhone && <> · {formatPhone(p.payerPhone)}</>}
                      </span>
                      <small>{formatDateTime(p.receivedAt)} · {p.source === 'SMS' ? `SMS de ${p.sender}` : 'Ligdicash'}{p.detail && ` · ${p.detail}`}</small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
