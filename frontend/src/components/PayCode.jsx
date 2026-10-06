import { useEffect, useState } from 'react';
import { copyText, ussdHref } from '../utils/payment.js';

// Un code marchand prêt à composer : « Payer maintenant » ouvre le clavier du téléphone avec le code,
// « Copier le code » sert quand le téléphone ne le permet pas (souvent sur iPhone).
export default function PayCode({ label, code, compact }) {
  const [copied, setCopied] = useState(null); // null | true | false
  useEffect(() => {
    if (copied == null) return undefined;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className={`paycode${compact ? ' compact' : ''}`}>
      {label && <span className="paycode-l">{label}</span>}
      <code className="paycode-c">{code}</code>
      <div className="paycode-b">
        <a className="btn btn-p" href={ussdHref(code)}>Payer maintenant</a>
        <button type="button" className="btn btn-s" onClick={async () => setCopied(await copyText(code))}>
          {copied ? 'Code copié ✓' : 'Copier le code'}
        </button>
      </div>
      <span className="paycode-msg" role="status">
        {copied === false ? 'Copie impossible : recopiez le code à la main.' : ''}
      </span>
    </div>
  );
}
