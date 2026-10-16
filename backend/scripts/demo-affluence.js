// Lot 12 : coup de feu d'un soir sur la base DEV, pour essayer la nouvelle page Commandes avec une trentaine de
// commandes en cours. npm run demo:affluence (dans backend/). Essai à blanc, sans rien écrire : -- --essai
//
// - Dev seulement (nom du serveur seulement, jamais l'adresse), et seulement quand la démonstration est en place
//   (photo de demo:remplir, comptes, provenances et quartiers « Démo ») : il les réutilise, ne les change pas.
// - AJOUTE des commandes « Démo » (références BC-0…, clients « (Démo) » au 70 98 xx xx) et leurs tournées : elles
//   sont effacées par npm run demo:effacer, avec le reste de la démonstration. Rien d'autre n'est modifié.
// - Prix du vrai menu de dev (priceItems), chaque commande rejouée avec les règles de l'équipe (checkPlan).
// - Écriture directe dans la base : aucun message WhatsApp, aucune alerte.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { ACTIVE, STATUS_LABEL } from '../src/services/order-status.js';
import { needsThanks, noticePending, stageSince } from '../src/services/customer-messages.js';
import { waitLevel, waitMinutes } from '../../frontend/src/staff/orders2/waiting.js';
import { assertDev } from './demo-photo.js';
import { checkPlan, generatePlan } from './demo-plan.js';
import { DEMO_REF_PREFIX, DEMO_SOURCES, DEMO_ZONES, PHOTO_DIR, PHOTO_FILE, STAFF_PHONE_PREFIX, isDemoStaff, isDemoZone } from './demo-commun.js';

const DRY = process.argv.includes('--essai');
const WANTED = 30; // commandes encore en cours
const RUSH = { windowMinutes: 80, restaurantShare: 0.3, slowShare: 0.25, pendingShare: 0.15 };
const CHUNK = 500;

function stop(text) {
  console.error(`\nARRÊT : ${text}`);
  process.exit(1);
}

// En cours = une étape de la page Commandes (en cours, ou livrée pas encore remerciée)
const inProgress = (o) => ACTIVE.includes(o.status) || (o.status === 'LIVREE' && needsThanks(o));
const COLUMN = {
  PAIEMENT_A_VERIFIER: 'À vérifier', PAYEE: 'Payées', EN_PREPARATION: 'En préparation', PRETE_LIVRAISON: 'En préparation',
  EN_LIVRAISON: 'En livraison', PRETE: 'À retirer', LIVREE: 'Livrées · à remercier',
};
const LEVEL = { ok: 'normal', warn: 'orange', late: 'rouge' };

// La commande telle que la page Commandes la reçoit (mêmes calculs que staff-orders.service.js)
const asListed = (o) => ({ ...o, toThank: o.status === 'LIVREE' && needsThanks(o), stageSince: stageSince(o), noticePending: noticePending(o) });

async function existingDemo() {
  const staff = (await prisma.staffUser.findMany({ where: { phone: { startsWith: STAFF_PHONE_PREFIX } }, select: { id: true, name: true, phone: true } })).filter(isDemoStaff);
  const sources = await prisma.orderSource.findMany({ where: { name: { in: DEMO_SOURCES.map((s) => s.name) } }, select: { id: true, name: true } });
  const zones = (await prisma.deliveryZone.findMany({ where: { name: { in: DEMO_ZONES.map((z) => z.name) } } })).filter(isDemoZone);
  return { staff, sources, zones };
}

function plan(products, existing, now) {
  // Assez de commandes pour qu'environ 30 soient encore en cours ; graine différente à chaque lancement
  for (let count = 34, tries = 0; tries < 40; tries++, count += 2) {
    const p = generatePlan({ products, now, days: 0, seed: (now.getTime() + tries) % 2147483647, rush: { ...RUSH, count }, existing });
    if (p.orders.filter(inProgress).length >= WANTED) return p;
  }
  return null;
}

function writes(p) {
  const ops = [];
  const many = (model, rows) => {
    for (let i = 0; i < rows.length; i += CHUNK) ops.push(prisma[model].createMany({ data: rows.slice(i, i + CHUNK) }));
  };
  many('deliveryRun', p.runs);
  many('order', p.orders.map(({ items, statusChanges, events, ...o }) => o));
  many('orderItem', p.orders.flatMap((o) => o.items.map(({ drinks, ...l }) => ({ ...l, orderId: o.id }))));
  many('orderItemDrink', p.orders.flatMap((o) => o.items.flatMap((l) => l.drinks.map((d) => ({ ...d, orderItemId: l.id })))));
  many('orderStatusChange', p.orders.flatMap((o) => o.statusChanges.map((c) => ({ ...c, orderId: o.id }))));
  many('orderEvent', p.orders.flatMap((o) => o.events.map((e) => ({ ...e, orderId: o.id }))));
  return ops;
}

function printSummary(p, now) {
  const listed = p.orders.map(asListed);
  const live = listed.filter(inProgress);
  const done = listed.length - live.length;
  console.log(`\n── ${DRY ? 'Essai à blanc' : 'Coup de feu'} : ${listed.length} commandes « Démo » arrivées entre ${new Date(now - RUSH.windowMinutes * 60000).toISOString().slice(11, 16)} et ${now.toISOString().slice(11, 16)} (heure du Burkina) ──`);
  console.log(`Encore en cours : ${live.length} · déjà terminées (livrées et remerciées, ou annulées) : ${done}`);
  const cols = {};
  for (const o of live) {
    const c = COLUMN[o.status];
    cols[c] ||= { n: 0, ok: 0, warn: 0, late: 0, msg: 0 };
    cols[c].n++;
    cols[c][waitLevel(o, now.getTime())]++;
    if (o.noticePending) cols[c].msg++;
  }
  console.log('\nPar colonne (temps d’attente à l’étape : normal / orange / rouge · message à confirmer) :');
  for (const name of ['À vérifier', 'Payées', 'En préparation', 'En livraison', 'À retirer', 'Livrées · à remercier']) {
    const c = cols[name] || { n: 0, ok: 0, warn: 0, late: 0, msg: 0 };
    console.log(`  ${name.padEnd(22)} ${String(c.n).padStart(2)}   ${c.ok} / ${c.warn} / ${c.late}   ✉ ${c.msg}`);
  }
  const deliveries = live.filter((o) => o.mode === 'LIVRAISON');
  console.log(`\nLivraisons en cours : ${deliveries.filter((o) => o.deliveryOperator === 'PRESTATAIRE').length} par notre équipe, ${deliveries.filter((o) => o.deliveryOperator === 'RESTAURANT').length} par le restaurant · à récupérer : ${live.filter((o) => o.mode === 'A_EMPORTER').length} · tournées : ${p.runs.length}`);
  console.log(`Saisies par un agent : ${live.filter((o) => o.createdById).length} · sur le site : ${live.filter((o) => !o.createdById).length}`);
  console.log('\nExemples (les plus longues attentes) :');
  for (const o of [...live].sort((a, b) => waitMinutes(b, now.getTime()) - waitMinutes(a, now.getTime())).slice(0, 8)) {
    const status = o.mode === 'A_EMPORTER' && o.status === 'LIVREE' ? 'Retirée' : STATUS_LABEL[o.status];
    console.log(`  ${o.reference}  ${status.padEnd(22)} ${String(waitMinutes(o, now.getTime())).padStart(3)} min  ${LEVEL[waitLevel(o, now.getTime())].padEnd(6)} ${o.noticePending ? '✉ message à confirmer' : ''}`);
  }
}

async function main() {
  assertDev();
  if (!existsSync(join(PHOTO_DIR, PHOTO_FILE))) stop('la démonstration n’est pas en place sur dev (pas de photo) : lancez d’abord npm run demo:remplir.');
  const existing = await existingDemo();
  const products = await prisma.product.findMany({ include: { variants: true, category: true } });
  const now = new Date();
  let p;
  try {
    p = plan(products, existing, now);
  } catch (e) {
    stop(e.message);
  }
  if (!p) stop('pas assez de commandes pendant les heures d’ouverture (restaurant fermé maintenant ?). Rien n’est écrit.');

  // Références jamais déjà prises (la démonstration en a déjà des centaines)
  const taken = await prisma.order.count({ where: { reference: { in: p.orders.map((o) => o.reference) } } });
  if (taken) stop('une référence tirée existe déjà : relancez le script (nouveau tirage). Rien n’est écrit.');

  const check = checkPlan(p, products);
  const before = await prisma.order.count({ where: { reference: { startsWith: DEMO_REF_PREFIX }, status: { in: ACTIVE } } });
  printSummary(p, now);
  console.log(`\nDéjà dans dev avant le coup de feu : ${before} commande(s) « Démo » en cours (gardées telles quelles).`);
  console.log(`Vérifications (règles de l'équipe rejouées) : ${check.errors.length ? `${check.errors.length} ERREUR(S)` : 'toutes les étapes sont permises, prix identiques au serveur'}`);
  if (check.errors.length) {
    console.log(check.errors.slice(0, 20).join('\n'));
    stop('le coup de feu ne respecte pas les règles : rien n’est écrit.');
  }
  if (DRY) {
    console.log('\nEssai à blanc : RIEN n’a été écrit dans la base.');
    return;
  }
  console.log('\nÉcriture dans dev (une seule transaction, tout ou rien)…');
  await prisma.$transaction(writes(p));
  const after = await prisma.order.count({ where: { reference: { startsWith: DEMO_REF_PREFIX }, status: { in: ACTIVE } } });
  console.log(`Terminé : ${p.orders.length} commandes ajoutées ; ${after} commande(s) « Démo » en cours dans dev. Effacement : npm run demo:effacer.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
