// Lot 4 : connexion en deux temps et code à 6 chiffres du Prestataire (règles dans prestataire-auth.js).
// Chaque connexion, essai raté, blocage et code de secours utilisé est noté au journal de sécurité.
import { prisma } from '../lib/prisma.js';
import { hashToken, newSessionToken, verifyAgainstDummy, verifyPassword } from './staff-auth.js';
import {
  CHALLENGE_MINUTES, checkTotp, decryptSecret, isLocked, lockUntil, parseSecondFactor, PRESTATAIRE_SESSION_HOURS,
} from './prestataire-auth.js';
import { logSecurity } from './security-log.service.js';

const minutes = (n) => n * 60 * 1000;
// « 14 h 05 » (heure du Burkina = UTC)
const hourOf = (d) => `${String(d.getUTCHours()).padStart(2, '0')} h ${String(d.getUTCMinutes()).padStart(2, '0')}`;

// Essai raté (mot de passe ou code) : compté en base, et blocage au 5e. Renvoie { locked } ou null.
async function failure(user, detail, meta) {
  const now = new Date();
  const updated = await prisma.staffUser.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
  await logSecurity({ type: 'CONNEXION_ECHEC', actor: user, detail: `${detail} (essai raté n° ${updated.failedLogins})`, meta });
  const until = lockUntil(updated.failedLogins, now);
  if (!until) return null;
  await prisma.$transaction([
    prisma.staffUser.update({ where: { id: user.id }, data: { lockedUntil: until } }),
    prisma.staffLoginChallenge.deleteMany({ where: { userId: user.id } }),
  ]);
  await logSecurity({ type: 'COMPTE_BLOQUE', actor: user, detail: `Bloqué jusqu'à ${hourOf(until)} (heure du Burkina)`, meta });
  return { locked: true };
}

// Premier temps : mot de passe. Juste = jeton de 5 minutes pour taper le code (aucune page ouverte).
// Renvoie { challenge, expiresAt }, { locked: true } ou null (mot de passe faux).
export async function passwordStep(user, password, meta) {
  if (isLocked(user)) {
    await verifyAgainstDummy(password);
    await logSecurity({ type: 'CONNEXION_ECHEC', actor: user, detail: 'Essai pendant le blocage', meta });
    return { locked: true };
  }
  if (!(await verifyPassword(password, user.passwordHash))) return failure(user, 'Mot de passe faux', meta);
  if (!user.totpSecretEnc) {
    await logSecurity({ type: 'CONNEXION_ECHEC', actor: user, detail: 'Code de l’application pas encore configuré (npm run equipe:prestataire)', meta });
    return null;
  }
  const challenge = newSessionToken();
  const expiresAt = new Date(Date.now() + minutes(CHALLENGE_MINUTES));
  await prisma.$transaction([
    // Un seul jeton à la fois, et ménage des jetons expirés
    prisma.staffLoginChallenge.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] } }),
    prisma.staffLoginChallenge.create({ data: { tokenHash: hashToken(challenge), userId: user.id, expiresAt } }),
  ]);
  return { challenge, expiresAt };
}

// Code de secours encore inutilisé qui correspond, ou null
async function findRecoveryCode(db, userId, code) {
  const codes = await db.staffRecoveryCode.findMany({ where: { userId, usedAt: null } });
  for (const c of codes) if (await verifyPassword(code, c.codeHash)) return c;
  return null;
}

// Vérifie le code (6 chiffres ou code de secours) et le consomme dans la transaction tx.
// Renvoie { method: 'TOTP' | 'SECOURS', remaining? } ou null (code faux, déjà utilisé).
async function consumeSecondFactor(tx, user, input) {
  const parsed = parseSecondFactor(input);
  if (!parsed) return null;
  if (parsed.totp) {
    const step = checkTotp(decryptSecret(user.totpSecretEnc), parsed.totp, user.totpLastStep);
    if (step == null) return null;
    // Un même code ne sert qu'une fois, même envoyé deux fois en même temps
    const used = await tx.staffUser.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return used.count === 1 ? { method: 'TOTP' } : null;
  }
  const code = await findRecoveryCode(tx, user.id, parsed.recovery);
  if (!code) return null;
  const used = await tx.staffRecoveryCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return null;
  return { method: 'SECOURS', remaining: await tx.staffRecoveryCode.count({ where: { userId: user.id, usedAt: null } }) };
}

const SECOND_FACTOR_TIMEOUT = { timeout: 20000, maxWait: 10000 }; // jusqu'à 10 codes de secours à comparer (scrypt)

// Second temps : code. Renvoie { user, token, expiresAt } (session de 8 heures), { expired: true },
// { locked: true } ou null (code faux).
export async function codeStep(challengeToken, code, meta) {
  if (!challengeToken) return { expired: true };
  const challenge = await prisma.staffLoginChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) }, include: { user: true } });
  const user = challenge?.user;
  if (!challenge || challenge.expiresAt <= new Date() || !user.isActive || user.role !== 'PRESTATAIRE' || !user.totpSecretEnc) {
    return { expired: true };
  }
  if (isLocked(user)) return { locked: true };

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + PRESTATAIRE_SESSION_HOURS * 60 * 60 * 1000);
  const result = await prisma.$transaction(async (tx) => {
    const used = await consumeSecondFactor(tx, user, code);
    if (!used) return null;
    await tx.staffUser.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await tx.staffLoginChallenge.deleteMany({ where: { userId: user.id } });
    await tx.staffSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
    await tx.staffSession.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt, userAgent: meta?.userAgent || null } });
    return used;
  }, SECOND_FACTOR_TIMEOUT);
  if (!result) return failure(user, 'Code faux', meta);

  await logSecurity({ type: 'CONNEXION', actor: user, detail: result.method === 'SECOURS' ? 'Avec un code de secours' : 'Avec le code de l’application', meta });
  if (result.method === 'SECOURS') {
    await logSecurity({ type: 'CODE_SECOURS_UTILISE', actor: user, detail: `Codes de secours restants : ${result.remaining}`, meta });
  }
  return { user, token, expiresAt };
}

// Changement de son mot de passe dans l'application : le code est demandé en plus.
// Renvoie true, ou false (code faux, compté comme un essai raté, ou compte bloqué).
export async function checkCodeForPasswordChange(user, code, meta) {
  if (isLocked(user)) return false;
  const used = await prisma.$transaction((tx) => consumeSecondFactor(tx, user, code), SECOND_FACTOR_TIMEOUT);
  if (!used) {
    await failure(user, 'Code faux (changement du mot de passe)', meta);
    return false;
  }
  if (used.method === 'SECOURS') {
    await logSecurity({ type: 'CODE_SECOURS_UTILISE', actor: user, detail: `Changement du mot de passe. Codes de secours restants : ${used.remaining}`, meta });
  }
  return true;
}
