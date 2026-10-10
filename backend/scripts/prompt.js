// Questions au clavier pour les scripts de l'équipe (npm run equipe:patron, equipe:prestataire).
// Fonctionne au clavier comme avec des réponses envoyées d'un coup. Les mots de passe ne s'affichent pas.
import readline from 'node:readline';

export function createPrompt() {
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

  return { ask, askHidden: (question) => ask(question, { hidden: true }), close: () => rl.close() };
}
