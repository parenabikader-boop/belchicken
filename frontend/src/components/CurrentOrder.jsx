import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import { readCurrent, showCurrentBanner } from '../utils/tracking.js';

// Plan 4, suivi sans WhatsApp : « Votre commande en cours », en revenant sur le site, vers la page de suivi.
// Rien quand le suivi est éteint (aucune commande n'est alors gardée sur le téléphone).
export default function CurrentOrder() {
  const { pathname } = useLocation();
  const D = useT().tracking.direct;
  const current = readCurrent();
  if (!showCurrentBanner(current, pathname)) return null;
  return (
    <Link className="cur-order" to={`/suivi/${current.reference}?cle=${encodeURIComponent(current.key)}`}>
      <b>{D.current}</b>
      <span>{D.currentOpen(current.reference)} ›</span>
    </Link>
  );
}
