// Plan 2, solution A (PRÉPARÉE, contrat pas encore signé) : paiement du repas par Ligdicash, « Payin avec redirection »
// (developers.ligdicash.com). Même interrupteur PAIEMENT_AUTO et même validation que les SMS. Identifiants : variables
// Render LIGDICASH_API_KEY et LIGDICASH_API_TOKEN (vides = rien ne se fait). Règles sans base : testées.
//
// 1. Créer la facture (POST checkout-invoice/create) : montant des plats calculé par le serveur, référence de la
//    commande dans custom_data.transaction_id ; garder le token renvoyé (AutoPayment, statut EN_ATTENTE).
// 2. Le client paie sur la page Ligdicash (response_text = adresse de la page).
// 3. Ligdicash appelle callback_url. Règle de Ligdicash : ne JAMAIS agir sur ce message. On y lit seulement la
//    référence, on retrouve le token gardé, et on redemande le statut (GET checkout-invoice/confirm) : seul
//    status = completed, response_code = 00 et le montant exact valident la commande.
export const CREATE_URL = 'https://app.ligdicash.com/pay/v01/redirect/checkout-invoice/create';
export const CONFIRM_URL = 'https://app.ligdicash.com/pay/v01/redirect/checkout-invoice/confirm/';

export const ligdicashReady = (cfg) => Boolean(cfg?.ligdicashApiKey && cfg?.ligdicashApiToken);

export const ligdicashHeaders = (cfg, json = true) => ({
  Apikey: cfg.ligdicashApiKey,
  Authorization: `Bearer ${cfg.ligdicashApiToken}`,
  Accept: 'application/json',
  ...(json && { 'Content-Type': 'application/json' }),
});

// Corps de la facture : seulement le montant des plats (les frais de livraison sont payés au livreur)
export function invoiceBody(order, { siteUrl, apiUrl }) {
  const site = String(siteUrl).replace(/\/+$/, '');
  const back = `${site}/suivi/${order.reference}`;
  return {
    commande: {
      invoice: {
        items: [],
        total_amount: order.itemsTotal,
        devise: 'XOF',
        description: `Commande ${order.reference} - Belchicken Burkina`,
        customer: '',
        customer_firstname: '',
        customer_lastname: '',
        customer_email: '',
        external_id: '',
        otp: '',
      },
      store: { name: 'Belchicken Burkina', website_url: site },
      actions: { cancel_url: back, return_url: back, callback_url: `${String(apiUrl).replace(/\/+$/, '')}/api/paiements/ligdicash` },
      custom_data: { transaction_id: order.reference },
    },
  };
}

// Réponse de création : { token, url } ou { error }
export function readCreate(json) {
  if (json?.response_code === '00' && json.token && /^https:\/\//.test(json.response_text || '')) return { token: json.token, url: json.response_text };
  return { error: `Ligdicash : facture refusée (${json?.response_text || 'réponse illisible'}).` };
}

// Référence de la commande dans le message de Ligdicash (custom_data : tableau, parfois envoyé en texte JSON)
export function callbackReference(payload) {
  let data = payload?.custom_data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  if (Array.isArray(data)) {
    const entry = data.find((d) => d?.keyof_customdata === 'transaction_id');
    if (entry?.valueof_customdata) return String(entry.valueof_customdata).toUpperCase();
  } else if (data && typeof data === 'object' && data.transaction_id) {
    return String(data.transaction_id).toUpperCase();
  }
  return null;
}

// Réponse de « confirm » : la commande est-elle payée ? { paid: true, phone, operatorRef } ou { paid: false, reason }
export function readConfirm(json, order) {
  if (json?.response_code !== '00') return { paid: false, reason: `Ligdicash : vérification impossible (${json?.response_text || 'erreur'}).` };
  if (json.status !== 'completed') return { paid: false, pending: json.status === 'pending', reason: `Ligdicash : paiement ${json.status === 'pending' ? 'en attente' : 'non abouti'}.` };
  const amount = Number(json.amount ?? json.montant);
  if (amount !== order.itemsTotal) return { paid: false, reason: `Ligdicash : montant ${amount} F différent du montant des plats (${order.itemsTotal} F).` };
  return { paid: true, phone: json.customer ? `+${String(json.customer).replace(/\D/g, '')}` : null, operatorRef: json.oreference || json.request_id || null, operatorName: json.operator_name || null };
}
