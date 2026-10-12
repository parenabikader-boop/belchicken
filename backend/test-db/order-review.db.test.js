// Lot 7 : essai des règles de la base sur les avis, sur une VRAIE base, la branche Neon « dev » seulement.
// Lancé à part : npm run test:db (jamais par npm test, jamais sur Render). Refuse de tourner sur un autre
// serveur que dev. Crée deux commandes d'essai et un compte d'essai, vérifie que :
//   - notes hors de 1 à 5, lowRating faux, textes trop longs, deuxième avis : refusés par la base ;
//   - notes, commentaire et lowRating ne changent jamais ;
//   - (a) le rappel s'enregistre une fois, seulement sur un mauvais avis, sans rien changer d'autre ;
//   - (b) supprimer le compte vide le lien du rappel (le nom copié reste) ;
//   - supprimer la commande emporte son avis ;
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

const REFS = ['BC-ESSAIV', 'BC-ESSAIW'];
const PHONE = '+22670990591';
const REFUSED = /ne peut pas être modifié/;
const CHECK = /violates check constraint|check constraint/i;

async function cleanup() {
  await prisma.order.deleteMany({ where: { reference: { in: REFS } } });
  await prisma.staffUser.deleteMany({ where: { phone: PHONE } });
}

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const newOrder = (reference, mode = 'LIVRAISON') => prisma.order.create({
  data: {
    reference, mode, status: 'LIVREE', customerName: 'Essai avis', customerPhone: '+22670990599', paymentMethod: 'ORANGE_MONEY', itemsTotal: 1000,
    reviewToken: `essai-avis-${reference}`.padEnd(22, 'x').slice(0, 22),
  },
});

test('avis : règles de la base (notes, un seul avis, jamais modifié sauf le rappel, compte et commande supprimés)', async () => {
  await cleanup();
  const patron = await prisma.staffUser.create({
    data: { name: 'Essai avis', phone: PHONE, role: 'PATRON', passwordHash: await hashPassword('Essai-avis-lot7!') },
  });
  const order = await newOrder(REFS[0]);
  const good = await newOrder(REFS[1], 'A_EMPORTER');

  // 1. Notes hors de 1 à 5, lowRating qui ne correspond pas aux notes, textes trop longs : refusés
  const base = { orderId: order.id, callCenterRating: 5, foodRating: 5, deliveryRating: 5, lowRating: false };
  await assert.rejects(prisma.orderReview.create({ data: { ...base, foodRating: 6 } }), CHECK);
  await assert.rejects(prisma.orderReview.create({ data: { ...base, callCenterRating: 0 } }), CHECK);
  await assert.rejects(prisma.orderReview.create({ data: { ...base, deliveryRating: 0 } }), CHECK);
  await assert.rejects(prisma.orderReview.create({ data: { ...base, deliveryRating: 2 } }), CHECK); // lowRating devrait être vrai
  await assert.rejects(prisma.orderReview.create({ data: { ...base, lowRating: true } }), CHECK); // aucune mauvaise note
  await assert.rejects(prisma.orderReview.create({ data: { ...base, comment: 'x'.repeat(501) } }), CHECK);

  // Un mauvais avis (livraison 2/5) et un bon avis à emporter
  const low = await prisma.orderReview.create({ data: { ...base, deliveryRating: 2, lowRating: true, comment: 'Livreur en retard' } });
  const ok = await prisma.orderReview.create({ data: { orderId: good.id, callCenterRating: 4, foodRating: 5, deliveryRating: null, lowRating: false } });

  // 2. Un seul avis par commande
  await assert.rejects(prisma.orderReview.create({ data: { ...base, deliveryRating: 4 } }), /Unique constraint/i);

  // 3. Notes, commentaire, lowRating, heure, commande : jamais modifiés
  for (const data of [
    { foodRating: 4 }, { callCenterRating: 1 }, { deliveryRating: 5 }, { deliveryRating: null },
    { comment: 'Autre texte' }, { comment: null }, { lowRating: false }, { createdAt: new Date(0) }, { orderId: good.id },
  ]) {
    await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data }), REFUSED, JSON.stringify(data));
  }

  // 4. (a) Rappel : refusé sur un bon avis, refusé s'il change aussi une note, accepté seul, une seule fois
  const callBack = { calledBackAt: new Date(), calledBackById: patron.id, calledBackByName: patron.name, calledBackNote: 'Client rassuré' };
  await assert.rejects(prisma.orderReview.update({ where: { id: ok.id }, data: callBack }), REFUSED);
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { ...callBack, deliveryRating: 5 } }), REFUSED);
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { ...callBack, lowRating: false } }), REFUSED);
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { ...callBack, comment: null } }), REFUSED);
  await prisma.orderReview.update({ where: { id: low.id }, data: callBack });
  const called = await prisma.orderReview.findUnique({ where: { id: low.id } });
  assert.equal(called.calledBackById, patron.id);
  assert.equal(called.calledBackNote, 'Client rassuré');
  assert.equal(called.deliveryRating, 2);
  // Une seule fois : ni un deuxième rappel, ni une note du rappel changée ensuite
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { calledBackNote: 'Autre note' } }), REFUSED);
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { calledBackAt: new Date() } }), REFUSED);
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { calledBackAt: null } }), REFUSED);
  // Vider le lien ET changer autre chose en même temps : refusé
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { calledBackById: null, foodRating: 1 } }), REFUSED);
  await assert.rejects(prisma.orderReview.update({ where: { id: low.id }, data: { calledBackById: null, calledBackByName: 'Quelqu’un' } }), REFUSED);

  // 5. (b) Supprimer le compte : la base vide le lien du rappel, tout le reste reste identique
  await prisma.staffUser.delete({ where: { id: patron.id } });
  const kept = await prisma.orderReview.findUnique({ where: { id: low.id } });
  assert.equal(kept.calledBackById, null);
  assert.equal(kept.calledBackByName, 'Essai avis');
  assert.equal(kept.calledBackNote, 'Client rassuré');
  assert.equal(kept.calledBackAt.getTime(), called.calledBackAt.getTime());
  assert.deepEqual(
    [kept.callCenterRating, kept.foodRating, kept.deliveryRating, kept.comment, kept.lowRating],
    [5, 5, 2, 'Livreur en retard', true],
  );

  // 6. Supprimer les commandes d'essai : leurs avis partent avec elles
  await prisma.order.deleteMany({ where: { id: { in: [order.id, good.id] } } });
  assert.equal(await prisma.orderReview.count({ where: { id: { in: [low.id, ok.id] } } }), 0);
});
