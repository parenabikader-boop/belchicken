// Vérifie la connexion à Cloudinary sans jamais afficher les clés.
// Usage, depuis backend/ :  npm run cloudinary:check
import { env } from '../src/config/env.js';
import { cloudinary, cloudinaryEnabled } from '../src/lib/cloudinary.js';

const vars = {
  CLOUDINARY_CLOUD_NAME: env.cloudinary.cloudName,
  CLOUDINARY_API_KEY: env.cloudinary.apiKey,
  CLOUDINARY_API_SECRET: env.cloudinary.apiSecret,
};
for (const [name, value] of Object.entries(vars)) {
  console.log(`${name} : ${value ? 'présente' : 'absente'}`);
}

if (!cloudinaryEnabled()) {
  console.error('Cloudinary non configuré : complétez backend/.env.');
  process.exit(1);
}

try {
  await cloudinary.api.ping();
  console.log(`Connexion Cloudinary OK (dossier des photos : ${env.cloudinary.folder}/).`);
} catch (err) {
  // Message d'erreur de Cloudinary seulement : il ne contient pas les clés
  const message = err?.error?.message || err?.message || String(err);
  const code = err?.error?.http_code ? ` (code ${err.error.http_code})` : '';
  console.error(`Échec de la connexion Cloudinary${code} : ${message}`);
  process.exit(1);
}
