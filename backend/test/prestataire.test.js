// Lot 4 : compte Prestataire (code à 6 chiffres, clé chiffrée, codes de secours, blocage),
// interrupteurs des fonctions et droits. Sans base de données (bases factices en mémoire).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import {
  checkTotp, decryptSecret, encryptSecret, isLocked, lockUntil, newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, parseSecondFactor,
  RECOVERY_CODE_COUNT, totpKey, totpUri,
} from '../src/services/prestataire-auth.js';
import { FEATURE_KEYS, featureMap, historyCutoff } from '../src/services/features.js';
import { accessFor, challengeCookie } from '../src/middlewares/staff-auth.js';
import { isPatronLevel } from '../src/services/roles.js';
import { feeCorrectionError } from '../src/services/delivery-fees.js';
import { ownPasswordSchema, teamActionError } from '../src/services/team.js';
import { visibleWhere } from '../src/services/staff-orders.service.js';
import { getAppSettings } from '../src/services/app-settings.service.js';
import { loadGrid } from '../src/services/delivery-fees.service.js';

// ─── Code à 6 chiffres ───

// Exemples officiels de la norme (RFC 6238, annexe B) : 8 chiffres, période de 30 s
const RFC = [
  { algorithm: 'SHA1', secret: '12345678901234567890' },
  { algorithm: 'SHA256', secret: '12345678901234567890123456789012' },
  { algorithm: 'SHA512', secret: '1234567890123456789012345678901234567890123456789012345678901234' },
];
const RFC_VALUES = [
  [59, ['94287082', '46119246', '90693936']],
  [1111111109, ['07081804', '68084774', '25091201']],
  [1111111111, ['14050471', '67062674', '99943326']],
  [1234567890, ['89005924', '91819424', '93441116']],
  [2000000000, ['69279037', '90698825', '38618901']],
  [20000000000, ['65353130', '77737706', '47863826']],
];

test('code de l’application : exemples officiels de la norme RFC 6238 (bibliothèque otpauth)', () => {
  for (const [seconds, codes] of RFC_VALUES) {
    RFC.forEach(({ algorithm, secret }, i) => {
      const totp = new OTPAuth.TOTP({ algorithm, digits: 8, period: 30, secret: OTPAuth.Secret.fromLatin1(secret) });
      assert.equal(totp.generate({ timestamp: seconds * 1000 }), codes[i], `${algorithm} à ${seconds} s`);
    });
  }
});

const codeAt = (secret, ms) => new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: ms });

test('code de l’application : accepté, avec 30 s de tolérance, jamais deux fois', () => {
  const secret = newTotpSecret();
  const now = 1_760_000_000_000;
  const step = Math.floor(now / 30000);
  assert.equal(checkTotp(secret, codeAt(secret, now), null, now), step);
  // Horloge du téléphone un peu décalée : une période avant ou après
  assert.equal(checkTotp(secret, codeAt(secret, now - 30000), null, now), step - 1);
  assert.equal(checkTotp(secret, codeAt(secret, now + 30000), null, now), step + 1);
  // Plus loin : refusé
  assert.equal(checkTotp(secret, codeAt(secret, now - 90000), null, now), null);
  // Un code déjà accepté (ou plus ancien) ne sert plus
  assert.equal(checkTotp(secret, codeAt(secret, now), step, now), null);
  assert.equal(checkTotp(secret, codeAt(secret, now - 30000), step, now), null);
  // Forme invalide
  assert.equal(checkTotp(secret, '12345', null, now), null);
  assert.equal(checkTotp(secret, 'abcdef', null, now), null);
});

test('QR code : adresse otpauth avec le nom du restaurant, clé en base32', () => {
  const secret = newTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const uri = totpUri(secret, 'Kader');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /issuer=Belchicken/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

// ─── Clé chiffrée ───

test('clé du code chiffrée en base : relue avec la bonne clé seulement, toute modification refusée', () => {
  const key = randomBytes(32);
  const stored = encryptSecret('JBSWY3DPEHPK3PXP', key);
  assert.ok(!stored.includes('JBSWY3DPEHPK3PXP'));
  assert.notEqual(encryptSecret('JBSWY3DPEHPK3PXP', key), stored); // vecteur aléatoire
  assert.equal(decryptSecret(stored, key), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptSecret(stored, randomBytes(32)));
  const parts = stored.split('.');
  parts[3] = Buffer.from('autre chose').toString('base64url');
  assert.throws(() => decryptSecret(parts.join('.'), key));
  assert.throws(() => decryptSecret('abc', key));
});

test('PRESTATAIRE_TOTP_KEY : 32 octets en base64, sinon arrêt avec un message clair', () => {
  assert.equal(totpKey(randomBytes(32).toString('base64')).length, 32);
  assert.throws(() => totpKey(''), /PRESTATAIRE_TOTP_KEY/);
  assert.throws(() => totpKey(randomBytes(16).toString('base64')), /PRESTATAIRE_TOTP_KEY/);
});

// ─── Codes de secours ───

test('codes de secours : 10, tous différents, lisibles, tapés avec ou sans tiret', () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, RECOVERY_CODE_COUNT);
  for (const c of codes) assert.match(c, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  assert.equal(normalizeRecoveryCode('abcde-fghjk'), 'ABCDEFGHJK');
  assert.equal(normalizeRecoveryCode(' ABCDE FGHJK '), 'ABCDEFGHJK');
  assert.equal(normalizeRecoveryCode('ABCDE-FGHJ0'), null); // 0 n'existe pas dans les codes
  assert.equal(normalizeRecoveryCode('ABC'), null);
});

test('deuxième étape : 6 chiffres = code de l’application, sinon code de secours', () => {
  assert.deepEqual(parseSecondFactor('123 456'), { totp: '123456' });
  assert.deepEqual(parseSecondFactor('abcde-fghjk'), { recovery: 'ABCDEFGHJK' });
  assert.equal(parseSecondFactor('12345'), null);
  assert.equal(parseSecondFactor(''), null);
});

// ─── Blocage ───

test('blocage : 15 minutes au 5e essai raté, puis 1 heure à chaque nouvel essai raté', () => {
  const now = new Date('2026-10-10T10:00:00Z');
  assert.equal(lockUntil(4, now), null);
  assert.equal(lockUntil(5, now).toISOString(), '2026-10-10T10:15:00.000Z');
  assert.equal(lockUntil(6, now).toISOString(), '2026-10-10T11:00:00.000Z');
  assert.equal(isLocked({ lockedUntil: new Date('2026-10-10T10:15:00Z') }, now), true);
  assert.equal(isLocked({ lockedUntil: new Date('2026-10-10T09:59:00Z') }, now), false);
  assert.equal(isLocked({ lockedUntil: null }, now), false);
});

// ─── Droits ───

test('Prestataire : tout ce que fait le Patron, plus sa page ; jamais l’espace livreur', () => {
  const prestataire = { role: 'PRESTATAIRE', mustChangePassword: false };
  const patron = { role: 'PATRON', mustChangePassword: false };
  assert.equal(accessFor(prestataire, ['PATRON']), 'ok');
  assert.equal(accessFor(prestataire, ['PATRON', 'OPERATEUR']), 'ok');
  assert.equal(accessFor(prestataire, ['PRESTATAIRE']), 'ok');
  assert.equal(accessFor(patron, ['PRESTATAIRE']), 'refuse');
  assert.equal(accessFor({ role: 'OPERATEUR' }, ['PRESTATAIRE']), 'refuse');
  assert.equal(accessFor(prestataire, ['LIVREUR']), 'refuse');
  assert.equal(accessFor({ ...prestataire, mustChangePassword: true }, ['PATRON']), 'mot-de-passe');
  assert.equal(isPatronLevel('PRESTATAIRE'), true);
  assert.equal(isPatronLevel('OPERATEUR'), false);
});

test('Prestataire : corrige les frais après le départ du livreur, comme le Patron', () => {
  const route = { mode: 'LIVRAISON', status: 'EN_LIVRAISON', deliveryFee: 1000, deliveryFeeMethod: null, deliveryFeeVerifiedAt: null, cashRemittanceId: null };
  assert.equal(feeCorrectionError(route, 'PRESTATAIRE', 1500, 'Erreur de quartier'), null);
  assert.match(feeCorrectionError(route, 'OPERATEUR', 1500, 'Erreur de quartier'), /seul le Patron/);
});

test('page Équipe : le Patron ne peut rien faire sur le compte Prestataire', () => {
  const patron = { id: 'p1' };
  const prestataire = { id: 'x1', role: 'PRESTATAIRE', isActive: true };
  for (const action of ['reset', 'deactivate', 'reactivate']) assert.match(teamActionError(patron, prestataire, action), /Prestataire/);
});

test('mot de passe du Prestataire : 12 caractères au moins et code à 6 chiffres', () => {
  const schema = ownPasswordSchema(false, 12);
  assert.throws(() => schema.parse({ currentPassword: 'a', newPassword: 'court-11car', code: '123456' }), /12 caractères/);
  assert.throws(() => schema.parse({ currentPassword: 'a', newPassword: 'assez-long-12' }), /code/);
  assert.equal(schema.parse({ currentPassword: 'a', newPassword: 'assez-long-12', code: '123456' }).code, '123456');
  // Les autres comptes : rien ne change (8 caractères, pas de code)
  assert.equal(ownPasswordSchema(false).parse({ currentPassword: 'a', newPassword: '8-caract' }).newPassword, '8-caract');
});

test('jeton entre le mot de passe et le code : cookie httpOnly limité à l’adresse de connexion', () => {
  const set = challengeCookie('tok', new Date('2026-10-10T10:05:00Z'));
  assert.match(set, /^bc_equipe_code=tok; Path=\/api\/staff\/login; HttpOnly; SameSite=Lax; Expires=Sat, 10 Oct 2026 10:05:00 GMT/);
  assert.match(challengeCookie('', null), /Max-Age=0/);
});

// ─── Interrupteurs ───

test('interrupteurs : pas de ligne = ouvert, fermer ne touche que la fonction fermée', () => {
  const all = featureMap([]);
  assert.deepEqual(Object.keys(all), FEATURE_KEYS);
  assert.ok(Object.values(all).every(Boolean));
  const map = featureMap([{ key: 'CAISSE', enabled: false }, { key: 'HISTORIQUE', enabled: true }, { key: 'INCONNUE', enabled: false }]);
  assert.equal(map.CAISSE, false);
  assert.equal(map.HISTORIQUE, true);
  assert.equal(map.TABLEAU_DE_BORD, true);
  assert.equal('INCONNUE' in map, false);
  for (const key of ['HISTORIQUE', 'TABLEAU_DE_BORD', 'CAISSE', 'FRAIS_LIVRAISON', 'REGLAGES', 'PARCOURS_COURT', 'PRISE_COMMANDE_AGENT', 'SUPPLEMENT_NUIT']) {
    assert.ok(FEATURE_KEYS.includes(key), key);
  }
});

test('historique fermé : en cours, à remercier, et terminées depuis moins de 24 heures', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.deepEqual(visibleWhere(true, { now }), {});
  assert.equal(historyCutoff(now).toISOString(), '2026-10-09T12:00:00.000Z');
  const where = visibleWhere(false, { now });
  assert.deepEqual(where.OR[0], { status: { in: ['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'PRETE'] } });
  assert.equal(where.OR[1].status, 'LIVREE'); // à remercier
  assert.deepEqual(where.OR[2], { statusChanges: { some: { toStatus: { in: ['LIVREE', 'ANNULEE'] }, createdAt: { gte: historyCutoff(now) } } } });
  // Remerciement automatique : pas d'étape « à remercier »
  assert.equal(visibleWhere(false, { now, auto: true }).OR.length, 2);
});

const fakeDb = ({ app = null, delivery = null, closed = [] } = {}) => ({
  appSettings: { findUnique: async () => app },
  featureSwitch: { findMany: async () => closed.map((key) => ({ key, enabled: false })) },
  deliveryZone: { findMany: async () => [{ id: 'z1', name: 'Kamsonghin', fee: 500, nightFee: 300, isActive: true, position: 0 }] },
  deliveryDistanceBand: { findMany: async () => [] },
  deliverySettings: { findUnique: async () => delivery },
});

test('parcours court et prise de commande fermés : comme si le Patron les avait éteints', async () => {
  const app = { shortFlow: true, agentOrders: true, updatedByName: 'NABI', updatedAt: null };
  const open = await getAppSettings(fakeDb({ app }));
  assert.equal(open.shortFlow, true);
  assert.equal(open.agentOrders, true);
  assert.deepEqual(open.included, { shortFlow: true, agentOrders: true });
  const closed = await getAppSettings(fakeDb({ app, closed: ['PARCOURS_COURT'] }));
  assert.equal(closed.shortFlow, false);
  assert.equal(closed.agentOrders, true);
  assert.deepEqual(closed.included, { shortFlow: false, agentOrders: true });
  // Sans réglage enregistré : tout éteint, comme avant
  assert.equal((await getAppSettings(fakeDb())).shortFlow, false);
});

test('supplément de nuit fermé : plus d’heures de nuit, la grille continue de calculer', async () => {
  const delivery = { allowOtherZone: true, nightEnabled: true, nightStartMin: 22 * 60, nightEndMin: 6 * 60 };
  const open = await loadGrid(fakeDb({ delivery }));
  assert.deepEqual(open.night, { startMin: 1320, endMin: 360 });
  const closed = await loadGrid(fakeDb({ delivery, closed: ['SUPPLEMENT_NUIT'] }));
  assert.equal(closed.night, null);
  assert.equal(closed.zones.length, 1);
  // Page Frais de livraison fermée : la grille reste appliquée pour les clients
  assert.equal((await loadGrid(fakeDb({ delivery, closed: ['FRAIS_LIVRAISON'] }))).zones[0].fee, 500);
});
