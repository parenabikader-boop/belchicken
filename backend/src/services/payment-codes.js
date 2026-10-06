// Paiement mobile money par code marchand (USSD) : le client compose le code avec le montant déjà
// rempli, par exemple *144*10*66534483*5500#. Les codes viennent des réglages (env.payment), avec
// MONTANT à la place du montant. Sans base de données, testé dans test/payment-codes.test.js.
import { PAYMENT_LABELS } from '../utils/format.js';

// Les 3 opérateurs acceptés, dans l'ordre d'affichage
export const MOBILE_MONEY_METHODS = ['ORANGE_MONEY', 'MOOV_MONEY', 'TELECEL_MONEY'];

export const AMOUNT_TAG = 'MONTANT';

// « *144*10*66534483*MONTANT# » + 5500 -> « *144*10*66534483*5500# »
export const fillCode = (template, amount) => String(template).replaceAll(AMOUNT_TAG, String(Math.round(amount)));

// Un code de réglage utilisable : chiffres, * et #, avec MONTANT, terminé par #
export const isValidCodeTemplate = (template) =>
  typeof template === 'string' && template.includes(AMOUNT_TAG) && /^[*#0-9]+$/.test(template.replaceAll(AMOUNT_TAG, '0')) && template.endsWith('#');

// Les codes, montant rempli si `amount` est donné (sinon avec MONTANT, pour que le site le remplisse)
export const paymentCodes = (payment, amount) => ({
  merchantName: payment.merchantName,
  operators: MOBILE_MONEY_METHODS.map((method) => ({
    method,
    label: PAYMENT_LABELS[method],
    code: amount == null ? payment.codes[method] : fillCode(payment.codes[method], amount),
  })),
});

// Réglages mal écrits sur Render : signalés au démarrage du serveur
export const invalidCodeSettings = (payment) =>
  MOBILE_MONEY_METHODS.filter((m) => !isValidCodeTemplate(payment.codes[m])).map((m) => `${m}_CODE`);
