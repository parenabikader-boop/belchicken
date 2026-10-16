// Sur quelle base pointe cet ordinateur ? Affiche seulement le nom du serveur Neon, jamais l'adresse ni le mot de passe.
// Usage, depuis backend/ :  npm run base:nom
import 'dotenv/config';
import { DEV_SERVER, PROD_SERVER, serverNameOf } from './demo-commun.js';

for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const name = serverNameOf(process.env[key]);
  const label = name === DEV_SERVER ? 'dev' : name === PROD_SERVER ? 'PRODUCTION' : 'inconnu';
  console.log(`${key} : ${name || '(vide)'} (${label})`);
}
