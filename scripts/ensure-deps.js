// Installe avant "npm run dev" les dépendances qui manquent (racine, backend, frontend).
// Sans ça, un premier lancement sur une copie neuve échoue avec "concurrently: not found" (exit 127).
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { execSync } = require('node:child_process');

const root = join(__dirname, '..');
const PARTS = [
  { dir: root, check: 'concurrently', name: 'la racine' },
  { dir: join(root, 'backend'), check: 'express', name: 'le backend' },
  { dir: join(root, 'frontend'), check: 'vite', name: 'le frontend' },
];

for (const p of PARTS) {
  if (existsSync(join(p.dir, 'node_modules', p.check))) continue;
  console.log(`Installation des dépendances pour ${p.name}...`);
  execSync('npm install', { cwd: p.dir, stdio: 'inherit' });
}
