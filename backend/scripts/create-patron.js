// Crée le compte Patron de l'espace équipe (ou change son mot de passe s'il existe déjà).
// Usage, depuis backend/ :  npm run equipe:patron
// Le mot de passe est tapé au clavier, masqué, et n'est jamais affiché ni enregistré en clair.
import readline from 'node:readline';
import { prisma } from '../src/lib/prisma.js';
import { normalizePhone } from '../src/utils/phone.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../src/services/staff-auth.js';

// Lecture ligne par ligne : fonctionne au clavier comme avec des réponses envoyées d'un coup
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
rl.setPrompt('');
const lines = rl[Symbol.asyncIterator]();

// Pendant la saisie d'un mot de passe, les caractères tapés ne s'affichent pas
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
  if (!muted) write(text);
  else if (/[\r\n]/.test(text)) write('\n');
};

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden && !process.stdin.isTTY) process.stdout.write('\n');
  if (done) throw new Error('Saisie interrompue.');
  return hidden ? value : value.trim();
}
const askHidden = (question) => ask(question, { hidden: true });

async function main() {
  console.log("\nCréation du compte Patron de l'espace équipe Belchicken\n");

  const name = await ask('Votre nom : ');
  if (name.length < 2) throw new Error('Nom trop court.');

  const phone = normalizePhone(await ask('Votre numéro de téléphone (il servira à vous connecter) : '));
  if (!phone) throw new Error('Numéro de téléphone invalide. Exemple : 76 12 34 56');

  const existing = await prisma.staffUser.findUnique({ where: { phone } });
  if (existing) {
    const ok = await ask(`Un compte ${existing.role} existe déjà pour ${phone} (${existing.name}). Changer son mot de passe ? (o/n) : `);
    if (!/^o/i.test(ok)) return console.log("Rien n'a été modifié.");
  }

  const password = await askHidden(`Mot de passe (au moins ${PASSWORD_MIN_LENGTH} caractères, rien ne s'affiche quand vous tapez) : `);
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Mot de passe trop court : au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  const again = await askHidden('Retapez le mot de passe : ');
  if (again !== password) throw new Error('Les deux mots de passe sont différents.');

  const passwordHash = await hashPassword(password);
  if (existing) {
    // Nouveau mot de passe : les appareils déjà connectés sont déconnectés
    await prisma.$transaction([
      prisma.staffUser.update({ where: { id: existing.id }, data: { passwordHash, isActive: true } }),
      prisma.staffSession.deleteMany({ where: { userId: existing.id } }),
    ]);
    console.log(`\nMot de passe changé pour ${existing.name} (${phone}).`);
  } else {
    await prisma.staffUser.create({ data: { name, phone, role: 'PATRON', passwordHash } });
    console.log(`\nCompte Patron créé pour ${name} (${phone}).`);
  }
  console.log('Connexion : /equipe/connexion sur le site.\n');
}

main()
  .catch((e) => {
    console.error(`\nErreur : ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
