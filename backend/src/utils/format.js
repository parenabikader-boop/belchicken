export const formatFcfa = (n) =>
  `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} F`;

export const PAYMENT_LABELS = {
  ORANGE_MONEY: 'Orange Money',
  MOOV_MONEY: 'Moov Money',
};
