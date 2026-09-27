// 5500 -> "5 500 F", comme dans la maquette
export const formatPrice = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F';

export const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
