import { randomInt } from 'node:crypto';

// Sans 0/O ni 1/I/L : lisible au téléphone
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newOrderReference(length = 6) {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `BC-${s}`;
}
