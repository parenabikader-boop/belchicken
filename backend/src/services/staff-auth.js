// Outils de sécurité de l'espace équipe : mots de passe et jetons de session.
// Uniquement le module crypto de Node, sans dépendance.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Coût de scrypt : N=2^15 (≈ 100 ms par vérification), ce qui rend les essais en masse très lents
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 8;

// "scrypt$N$r$p$sel$empreinte" (sel et empreinte en base64) : les paramètres sont gardés
// avec l'empreinte pour pouvoir les durcir plus tard sans invalider les comptes existants.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return timingSafeEqual(key, expected);
}

// Empreinte vérifiée quand le numéro n'existe pas : la réponse prend le même temps,
// on ne peut donc pas deviner quels numéros ont un compte.
let dummyHash;
export async function verifyAgainstDummy(password) {
  dummyHash ??= await hashPassword('mot-de-passe-factice');
  await verifyPassword(password, dummyHash);
  return false;
}

// Jeton envoyé au navigateur (cookie) ; la base ne garde que son empreinte SHA-256
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
