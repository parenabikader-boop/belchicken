// Plan 3, frais par kilomètre : le client a-t-il accepté le montant affiché ? Sans React : testé dans km-fee.test.js.
// Un autre montant (nouvelle position, autre quartier, prix changé) doit être accepté de nouveau.

// Aperçu prêt : un montant calculé par le serveur
export const quoteReady = (quote) => Boolean(quote && !quote.loading && !quote.error && quote.fee != null);

export const kmAcceptedFor = (quote, accepted) =>
  quoteReady(quote) && Boolean(accepted) && accepted.fee === quote.fee && accepted.source === quote.source && (accepted.zoneName ?? null) === (quote.zoneName ?? null);

// Ordre des étapes de la page : grille par km active, la livraison (et ses frais à accepter) avant le paiement
export const checkoutOrder = (kmMode) => (kmMode ? ['contact', 'mode', 'payment'] : ['contact', 'payment', 'mode']);
