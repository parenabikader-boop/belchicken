import { app } from './app.js';
import { env, whatsappEnabled } from './config/env.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(env.port, () => {
  console.log(`API Belchicken sur http://localhost:${env.port}`);
  if (!whatsappEnabled()) console.warn('WhatsApp non configuré : les alertes équipe sont désactivées.');
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
