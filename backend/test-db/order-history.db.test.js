// Lot 5c : essai de la règle des preuves sur une VRAIE base, la branche Neon « dev » seulement.
// Lancé à part : npm run test:db (jamais par npm test, jamais sur Render). Refuse de tourner sur un autre
// serveur que dev. Crée une commande d'essai et un compte d'essai, vérifie que :
//   - modifier une ligne d'historique est refusé par la base ;
//   - supprimer un compte vide le lien de l'historique (le nom copié reste) ;
//   - supprimer la commande emporte tout son historique (nettoyage des commandes d'essai) ;
// puis ne laisse rien derrière lui.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/services/staff-auth.js';

const DEV_SERVER = 'ep-nameless-band-b4vetndd';
const PROD_SERVER = 'ep-damp-lab-b44k8hrf';
const url = process.env.DATABASE_URL || '';
if (!url.includes(DEV_SERVER) || url.includes(PROD_SERVER)) {
  throw new Error('test:db refusé : il ne tourne que sur la base dev.');
}

const REF = 'BC-ESSAIH';
const PHONE = '+22670990590';

async function cleanup() {
  await prisma.order.deleteMany({ where: { reference: REF } });
  await prisma.staffUser.deleteMany({ where: { phone: PHONE } });
}

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('preuves : historique non modifiable, compte supprimable, commande d’essai supprimée avec son historique', async () => {
  await cleanup();
  const agent = await prisma.staffUser.create({
    data: { name: 'Essai historique', phone: PHONE, role: 'OPERATEUR', passwordHash: await hashPassword('Essai-historique!') },
  });
  const order = await prisma.order.create({
    data: {
      reference: REF, customerName: 'Essai historique', customerPhone: '+22670990599', paymentMethod: 'ORANGE_MONEY', itemsTotal: 1000,
      statusChanges: { create: [{ toStatus: 'PAIEMENT_A_VERIFIER' }, { fromStatus: 'PAIEMENT_A_VERIFIER', toStatus: 'PAYEE', staffUserId: agent.id, staffName: agent.name }] },
      events: { create: [{ type: 'FRAIS_SAISIS', amount: 500, staffUserId: agent.id, staffName: agent.name }] },
    },
    include: { statusChanges: true, events: true },
  });
  const change = order.statusChanges.find((c) => c.toStatus === 'PAYEE');
  const event = order.events[0];

  // 1. Modifier une preuve : refusé par la base (étape, motif, heure, montant, nom)
  await assert.rejects(prisma.orderStatusChange.update({ where: { id: change.id }, data: { toStatus: 'LIVREE' } }), /ne peut pas être modifié/);
  await assert.rejects(prisma.orderStatusChange.update({ where: { id: change.id }, data: { createdAt: new Date(0) } }), /ne peut pas être modifié/);
  await assert.rejects(prisma.orderEvent.update({ where: { id: event.id }, data: { amount: 1 } }), /ne peut pas être modifié/);
  await assert.rejects(prisma.orderEvent.update({ where: { id: event.id }, data: { staffName: 'Quelqu’un d’autre' } }), /ne peut pas être modifié/);
  // Vider le lien ET changer autre chose en même temps : refusé aussi, sur les deux tables
  await assert.rejects(prisma.orderEvent.update({ where: { id: event.id }, data: { staffUserId: null, amount: 1 } }), /ne peut pas être modifié/);
  await assert.rejects(prisma.orderStatusChange.update({ where: { id: change.id }, data: { staffUserId: null, reason: 'x' } }), /ne peut pas être modifié/);

  // 2. Supprimer le compte : la base vide le lien de l'historique, le nom copié reste
  await prisma.staffUser.delete({ where: { id: agent.id } });
  const kept = await prisma.orderStatusChange.findUnique({ where: { id: change.id } });
  assert.equal(kept.staffUserId, null);
  assert.equal(kept.staffName, 'Essai historique');
  const keptEvent = await prisma.orderEvent.findUnique({ where: { id: event.id } });
  assert.equal(keptEvent.staffUserId, null);
  assert.equal(keptEvent.staffName, 'Essai historique');
  assert.equal(keptEvent.amount, 500);

  // 3. Supprimer la commande d'essai : tout son historique part avec elle
  await prisma.order.delete({ where: { id: order.id } });
  assert.equal(await prisma.orderStatusChange.count({ where: { orderId: order.id } }), 0);
  assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id } }), 0);
});
