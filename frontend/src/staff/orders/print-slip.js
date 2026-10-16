// Plan 1, call center allégé : « Paiement vérifié » imprime aussi le bon, dans le même geste. Sans React : testé
// dans print-slip.test.js.
//
// Le bon s'imprime depuis un cadre invisible (iframe) : pas de nouvel onglet, donc rien à bloquer par le navigateur,
// et WhatsApp peut toujours s'ouvrir à côté. Le cadre charge la page du bon (OrderSlip.jsx) avec ?imprimer=1, qui
// lance l'impression dès que le bon est chargé. Seulement quand l'interrupteur CALL_CENTER_ALLEGE est ouvert.
export const CALL_CENTER_LIGHT = 'CALL_CENTER_ALLEGE';

// Ouvert seulement si le serveur dit explicitement true (fermé, inconnu ou illisible = comme avant)
export const isCallCenterLight = (features) => features?.[CALL_CENTER_LIGHT] === true;

// Adresse du bon à imprimer : ticket 80 mm (le format du comptoir)
export const slipPrintUrl = (reference, format = '80') =>
  `/equipe/commandes/${encodeURIComponent(reference)}/bon?format=${format === 'a4' ? 'a4' : '80'}&imprimer=1`;

// Le bon doit-il lancer l'impression tout seul ? (?imprimer=1)
export const autoPrintAsked = (search) => search.get('imprimer') === '1';

// Lance l'impression du bon depuis un cadre invisible, retiré au bout de 2 minutes
export function printSlip(reference, { format = '80', doc = document } = {}) {
  const frame = doc.createElement('iframe');
  frame.title = `Bon ${reference}`;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  frame.src = slipPrintUrl(reference, format);
  doc.body.appendChild(frame);
  setTimeout(() => frame.remove(), 120000);
  return frame;
}
