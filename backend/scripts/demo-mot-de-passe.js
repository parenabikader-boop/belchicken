// Démonstration commerciale : choisir le mot de passe d'un compte « Démo » (Responsable livraison, livreurs,
// agents, Patron) pour jouer des scénarios sur la base DEV. npm run demo:mot-de-passe (dans backend/).
//
// Dev seulement. Comptes « Démo » seulement (nom « … (Démo) » et numéro 70 97 00 xx), jamais « Prestataire
// (Démo) » (npm run equipe:prestataire, choix 3, avec le code à 6 chiffres). Mot de passe tapé deux fois, jamais
// affiché. Ne change que le mot de passe ; les connexions ouvertes de ce compte sont fermées.
import { prisma } from '../src/lib/prisma.js';
import { normalizePhone } from '../src/utils/phone.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../src/services/staff-auth.js';
import { createPrompt } from './prompt.js';
import { assertDev } from './demo-photo.js';
import { passwordTargetError } from './demo-commun.js';

const { ask, askHidden, close } = createPrompt();

async function one() {
  const phone = normalizePhone(await ask('Numéro du compte « Démo » (ex. 70 97 00 08) : '));
  const user = phone ? await prisma.staffUser.findUnique({ where: { phone }, select: { id: true, name: true, phone: true, role: true } }) : null;
  const error = passwordTargetError(user, phone);
  if (error) return console.log(error);
  const password = await askHidden(`Nouveau mot de passe de ${user.name} (${PASSWORD_MIN_LENGTH} caractères au moins, rien ne s'affiche) : `);
  if (password.length < PASSWORD_MIN_LENGTH) return console.log(`Trop court : ${PASSWORD_MIN_LENGTH} caractères au moins. Rien n'a été changé.`);
  if (password.length > 200) return console.log('Trop long. Rien n’a été changé.');
  if ((await askHidden('Retapez-le : ')) !== password) return console.log('Les deux mots de passe sont différents. Rien n’a été changé.');
  await prisma.$transaction([
    prisma.staffUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
    prisma.staffSession.deleteMany({ where: { userId: user.id } }),
  ]);
  console.log(`Mot de passe enregistré pour ${user.name}.`);
}

async function main() {
  assertDev();
  for (;;) {
    await one();
    if (!/^o/i.test(await ask('\nUn autre compte ? (o/n) : '))) break;
  }
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
