// prisma migrate deploy, relancé si la base Neon dort encore (elle met quelques secondes à se réveiller).
// Utilisé par le build Render (voir render.yaml) : sans ça, un déploiement peut échouer pour rien.
import { spawnSync } from 'node:child_process';

const ATTEMPTS = 4;
for (let i = 1; i <= ATTEMPTS; i++) {
  const { status } = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: true });
  if (status === 0) process.exit(0);
  if (i < ATTEMPTS) {
    console.log(`Migrations : base injoignable, nouvel essai dans 5 s (${i}/${ATTEMPTS - 1})…`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
console.error('Migrations impossibles : vérifiez DIRECT_URL.');
process.exit(1);
