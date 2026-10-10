// Lot 4 : sécurité du compte Prestataire, sans base de données (testé dans test/prestataire.test.js).
// Connexion en deux temps : mot de passe (12 caractères au moins), puis code à 6 chiffres de Google
// Authenticator (TOTP, bibliothèque otpauth) ou code de secours à usage unique.
import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { env } from '../config/env.js';

export const PRESTATAIRE_PASSWORD_MIN = 12;
export const CHALLENGE_MINUTES = 5; // entre le mot de passe et le code
export const PRESTATAIRE_SESSION_HOURS = 8; // durée fixe, quelle que soit l'activité
export const RECOVERY_CODE_COUNT = 10;

// ─── Code à 6 chiffres (RFC 6238 : SHA-1, 30 secondes) ───

const PERIOD = 30;
export const TOTP_ISSUER = 'Belchicken Équipe';

const totpFor = (secretBase32, label = 'Prestataire') =>
  new OTPAuth.TOTP({ issuer: TOTP_ISSUER, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secretBase32) });

// Nouvelle clé secrète (160 bits, en base32 comme l'attend Google Authenticator)
export const newTotpSecret = () => new OTPAuth.Secret({ size: 20 }).base32;

// Adresse otpauth:// du QR code à scanner
export const totpUri = (secretBase32, label) => totpFor(secretBase32, label).toString();

// Période du code accepté, ou null. Tolérance d'une période avant ou après (horloge du téléphone un peu
// décalée). Un code déjà accepté (période <= lastStep) est refusé : un même code ne sert qu'une fois.
export function checkTotp(secretBase32, code, lastStep = null, now = Date.now()) {
  if (!/^\d{6}$/.test(code || '')) return null;
  const delta = totpFor(secretBase32).validate({ token: code, timestamp: now, window: 1 });
  if (delta == null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  if (lastStep != null && step <= lastStep) return null;
  return step;
}

// ─── Clé secrète chiffrée en base (AES-256-GCM, clé PRESTATAIRE_TOTP_KEY) ───

export function totpKey(raw = env.prestataireTotpKey) {
  const key = Buffer.from(raw || '', 'base64');
  if (key.length !== 32) throw new Error('PRESTATAIRE_TOTP_KEY manquante ou invalide (32 octets en base64 attendus).');
  return key;
}

// "v1.iv.tag.texte" (base64url)
export function encryptSecret(plain, key = totpKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(stored, key = totpKey()) {
  const [version, iv, tag, data] = String(stored || '').split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Clé du code abîmée.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// ─── Codes de secours ───

// Sans 0/O, 1/I/L : lisibles une fois imprimés ou recopiés à la main
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// "ABCDE-FGHJK"
export function newRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

// Tapé avec ou sans tiret, espaces, minuscules : même code. null = pas la forme d'un code de secours.
export function normalizeRecoveryCode(input) {
  const clean = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  return new RegExp(`^[${ALPHABET}]{10}$`).test(clean) ? clean : null;
}

// Code tapé à la deuxième étape : { totp: '123456' }, { recovery: 'ABCDEFGHJK' } ou null
export function parseSecondFactor(input) {
  const raw = String(input || '').replace(/\s/g, '');
  if (/^\d{6}$/.test(raw)) return { totp: raw };
  const recovery = normalizeRecoveryCode(raw);
  return recovery ? { recovery } : null;
}

// ─── Blocage après des essais ratés (mot de passe ou code), gardé en base ───

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15; // au 5e essai raté
export const RELOCK_MINUTES = 60; // chaque essai raté ensuite, jusqu'à une connexion réussie

// Fin du blocage après le n-ième essai raté d'affilée, ou null
export function lockUntil(failedLogins, now = new Date()) {
  if (failedLogins < MAX_FAILED_LOGINS) return null;
  const minutes = failedLogins === MAX_FAILED_LOGINS ? LOCK_MINUTES : RELOCK_MINUTES;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

export const isLocked = (user, now = new Date()) => Boolean(user.lockedUntil && user.lockedUntil > now);
