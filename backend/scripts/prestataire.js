// Lot 4 : compte Prestataire, géré seulement ici, sur l'ordinateur (jamais depuis une page).
// Usage, depuis backend/ :  npm run equipe:prestataire
//   1. Créer le compte (QR code pour Google Authenticator et 10 codes de secours, affichés une seule fois)
//   2. Téléphone perdu : nouvelle clé, nouveaux codes de secours, tous les appareils déconnectés
//   3. Nouveau mot de passe (tous les appareils déconnectés)
//   4. Débloquer le compte après des essais ratés
// Chaque action est notée au journal de sécurité. Demande PRESTATAIRE_TOTP_KEY dans backend/.env.
import qrcode from 'qrcode-terminal';
import { prisma } from '../src/lib/prisma.js';
import { normalizePhone } from '../src/utils/phone.js';
import { hashPassword } from '../src/services/staff-auth.js';
import {
  checkTotp, encryptSecret, newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, PRESTATAIRE_PASSWORD_MIN, TOTP_ISSUER, totpKey, totpUri,
} from '../src/services/prestataire-auth.js';
import { logSecurity } from '../src/services/security-log.service.js';
import { createPrompt } from './prompt.js';

const { ask, askHidden, close } = createPrompt();

async function askPassword() {
  const password = await askHidden(`Mot de passe (au moins ${PRESTATAIRE_PASSWORD_MIN} caractères, rien ne s'affiche quand vous tapez) : `);
  if (password.length < PRESTATAIRE_PASSWORD_MIN) throw new Error(`Mot de passe trop court : au moins ${PRESTATAIRE_PASSWORD_MIN} caractères.`);
  if (password.length > 200) throw new Error('Mot de passe trop long.');
  const again = await askHidden('Retapez le mot de passe : ');
  if (again !== password) throw new Error('Les deux mots de passe sont différents.');
  return hashPassword(password);
}

async function askPhone(question) {
  const phone = normalizePhone(await ask(question));
  if (!phone) throw new Error('Numéro de téléphone invalide. Exemple : 76 12 34 56');
  return phone;
}

async function findPrestataire() {
  const phone = await askPhone('Numéro du compte Prestataire : ');
  const user = await prisma.staffUser.findUnique({ where: { phone } });
  if (!user || user.role !== 'PRESTATAIRE') throw new Error("Aucun compte Prestataire n'a ce numéro.");
  return user;
}

const qr = (text) => new Promise((resolve) => qrcode.generate(text, { small: true }, (out) => resolve(out)));

// Nouvelle clé : QR code, clé en texte (si le QR code s'affiche mal), puis vérification avec un code de
// l'application avant d'enregistrer quoi que ce soit. Renvoie la clé en clair (jamais enregistrée en clair).
async function setupTotp(name) {
  const secret = newTotpSecret();
  console.log('\n1. Ouvrez Google Authenticator sur votre téléphone, touchez « + », puis « Scanner un code QR » :\n');
  console.log(await qr(totpUri(secret, name)));
  console.log('   Si le QR code s’affiche mal, choisissez « Saisir une clé de configuration » et tapez :');
  console.log(`   Compte : ${TOTP_ISSUER} (${name})`);
  console.log(`   Clé    : ${secret.match(/.{1,4}/g).join(' ')}`);
  console.log('   Type   : basé sur l’heure\n');
  for (let i = 1; i <= 3; i++) {
    const code = (await ask('2. Tapez le code à 6 chiffres affiché par l’application : ')).replace(/\s/g, '');
    if (checkTotp(secret, code) != null) return secret;
    if (i < 3) console.log('Code incorrect. Vérifiez l’heure du téléphone et réessayez.');
  }
  throw new Error("Code incorrect 3 fois : rien n'a été enregistré. Relancez le script.");
}

const recoveryRows = (codes) => Promise.all(codes.map(async (code) => ({ codeHash: await hashPassword(normalizeRecoveryCode(code)) })));

function showRecoveryCodes(codes) {
  console.log('\n3. Vos 10 codes de secours (chacun ne sert qu’une fois, si vous n’avez plus votre téléphone).');
  console.log('   Notez-les sur papier et rangez-les en lieu sûr. Ils ne seront plus jamais affichés.\n');
  codes.forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}. ${c}`));
  console.log('');
}

async function create() {
  const name = await ask('Nom affiché : ');
  if (name.length < 2 || name.length > 60) throw new Error('Nom de 2 à 60 caractères.');
  const phone = await askPhone('Numéro de téléphone (il servira à vous connecter) : ');
  const existing = await prisma.staffUser.findUnique({ where: { phone } });
  if (existing) throw new Error(`Ce numéro a déjà un compte (${existing.name}, ${existing.role}).`);
  const passwordHash = await askPassword();
  const secret = await setupTotp(name);
  const codes = newRecoveryCodes();
  const rows = await recoveryRows(codes);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.staffUser.create({
      data: { name, phone, role: 'PRESTATAIRE', passwordHash, totpSecretEnc: encryptSecret(secret), recoveryCodes: { create: rows } },
    });
    await logSecurity({ type: 'SCRIPT', actor: created, detail: 'Création du compte Prestataire' }, tx);
    return created;
  });
  showRecoveryCodes(codes);
  console.log(`Compte Prestataire créé pour ${user.name} (${phone}). Connexion : /equipe/connexion sur le site.\n`);
}

async function lostPhone() {
  const user = await findPrestataire();
  const ok = await ask(`Nouvelle clé pour ${user.name} : l'ancienne application et les anciens codes de secours ne marcheront plus. Continuer ? (o/n) : `);
  if (!/^o/i.test(ok)) return console.log("Rien n'a été modifié.");
  const secret = await setupTotp(user.name);
  const codes = newRecoveryCodes();
  const rows = await recoveryRows(codes);
  await prisma.$transaction(async (tx) => {
    await tx.staffRecoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.staffUser.update({
      where: { id: user.id },
      data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null, failedLogins: 0, lockedUntil: null, recoveryCodes: { create: rows } },
    });
    await tx.staffSession.deleteMany({ where: { userId: user.id } });
    await tx.staffLoginChallenge.deleteMany({ where: { userId: user.id } });
    await logSecurity({ type: 'SCRIPT', actor: user, detail: 'Téléphone perdu : nouvelle clé, nouveaux codes de secours, appareils déconnectés' }, tx);
  });
  showRecoveryCodes(codes);
  console.log('Nouvelle clé enregistrée. Tous les appareils ont été déconnectés.\n');
}

async function newPassword() {
  const user = await findPrestataire();
  const passwordHash = await askPassword();
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: user.id }, data: { passwordHash, isActive: true } });
    await tx.staffSession.deleteMany({ where: { userId: user.id } });
    await tx.staffLoginChallenge.deleteMany({ where: { userId: user.id } });
    await logSecurity({ type: 'SCRIPT', actor: user, detail: 'Nouveau mot de passe, appareils déconnectés' }, tx);
  });
  console.log(`\nMot de passe changé pour ${user.name}. Tous les appareils ont été déconnectés.\n`);
}

async function unlock() {
  const user = await findPrestataire();
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    await logSecurity({ type: 'SCRIPT', actor: user, detail: 'Compte débloqué' }, tx);
  });
  console.log(`\nCompte de ${user.name} débloqué.\n`);
}

async function main() {
  totpKey(); // arrête tout de suite si PRESTATAIRE_TOTP_KEY manque
  console.log('\nCompte Prestataire de l’espace équipe Belchicken\n');
  console.log('  1. Créer le compte');
  console.log('  2. Téléphone perdu (nouvelle clé et nouveaux codes de secours)');
  console.log('  3. Nouveau mot de passe');
  console.log('  4. Débloquer le compte\n');
  const choice = await ask('Votre choix (1 à 4) : ');
  const actions = { 1: create, 2: lostPhone, 3: newPassword, 4: unlock };
  if (!actions[choice]) throw new Error('Choix inconnu.');
  await actions[choice]();
}

main()
  .catch((e) => {
    console.error(`\nErreur : ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    close();
    await prisma.$disconnect();
  });
