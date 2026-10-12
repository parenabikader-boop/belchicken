// Démonstration commerciale : remplit la base DEV (jamais la production) avec environ un mois d'activité
// fictive. npm run demo:remplir (dans backend/). Essai à blanc, sans rien écrire : npm run demo:remplir -- --essai
//
// 1. Refuse de tourner ailleurs que sur dev (nom du serveur seulement, jamais l'adresse).
// 2. Refuse si une démonstration est déjà en place (photo ou données « Démo » présentes).
// 3. Lit le vrai menu de dev, génère les commandes (demo-plan.js) et les rejoue avec les règles de l'équipe.
// 4. Essai à blanc : affiche le résumé et s'arrête.
// 5. Sinon : demande le mot de passe de « Patron (Démo) », prend la photo de dev, puis écrit tout en une seule
//    transaction (tout ou rien). Écrit directement dans la base : aucun message WhatsApp, aucune alerte, aucune
//    ligne du journal de sécurité. Effacement : npm run demo:effacer.
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../src/services/staff-auth.js';
import { createPrompt } from './prompt.js';
import { assertDev, photoToSave, takePhoto } from './demo-photo.js';
import { checkPlan, generatePlan, summarize } from './demo-plan.js';
import {
  CUSTOMER_PHONE_PREFIX, DEMO_COMPANY, DEMO_FEATURES, DEMO_NIGHT, DEMO_REF_PREFIX, DEMO_SOURCES, DEMO_TERMS_NOTE,
  DEMO_ZONES, PHOTO_DIR, PHOTO_FILE, PRESTATAIRE_DEMO, STAFF_PHONE_PREFIX,
} from './demo-commun.js';

const DRY = process.argv.includes('--essai');
const CHUNK = 500;

function stop(text) {
  console.error(`\nARRÊT : ${text}`);
  process.exit(1);
}

async function alreadyThere() {
  const found = [];
  if (existsSync(join(PHOTO_DIR, PHOTO_FILE))) found.push(`photo ${join(PHOTO_DIR, PHOTO_FILE)}`);
  const orders = await prisma.order.count({ where: { OR: [{ reference: { startsWith: DEMO_REF_PREFIX } }, { customerPhone: { startsWith: CUSTOMER_PHONE_PREFIX } }] } });
  if (orders) found.push(`${orders} commande(s) BC-0… ou au téléphone +226 70 98…`);
  const staff = await prisma.staffUser.count({ where: { phone: { startsWith: STAFF_PHONE_PREFIX } } });
  if (staff) found.push(`${staff} compte(s) au téléphone +226 70 97 0…`);
  const sources = await prisma.orderSource.count({ where: { name: { in: DEMO_SOURCES.map((s) => s.name) } } });
  if (sources) found.push(`${sources} provenance(s) « Démo »`);
  const terms = await prisma.deliveryContractTerms.count({ where: { note: DEMO_TERMS_NOTE } });
  if (terms) found.push(`${terms} version(s) des conditions « Démo »`);
  const zones = await prisma.deliveryZone.findMany({ where: { name: { in: DEMO_ZONES.map((z) => z.name) } }, select: { name: true } });
  if (zones.length) found.push(`quartier(s) déjà dans la grille de dev : ${zones.map((z) => z.name).join(', ')}`);
  return found;
}

async function askPassword() {
  const prompt = createPrompt();
  try {
    for (;;) {
      const a = await prompt.ask(`Mot de passe de « Patron (Démo) » (${PASSWORD_MIN_LENGTH} caractères au moins) : `, { hidden: true });
      if (!a || a.length < PASSWORD_MIN_LENGTH) {
        console.log(`Trop court : ${PASSWORD_MIN_LENGTH} caractères au moins.`);
        continue;
      }
      const b = await prompt.ask('Encore une fois : ', { hidden: true });
      if (a === b) return a;
      console.log('Les deux mots de passe sont différents. Recommencez.');
    }
  } finally {
    prompt.close();
  }
}

const chunks = (list) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

function writes(plan, passwords) {
  const ops = [];
  const many = (model, rows) => chunks(rows).forEach((part) => ops.push(prisma[model].createMany({ data: part })));
  many('staffUser', plan.staff.map((s) => ({
    id: s.id, name: s.name, phone: s.phone, role: s.role, courierTeam: s.courierTeam, passwordHash: passwords.get(s.id), mustChangePassword: false,
  })));
  many('orderSource', plan.sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, phone: s.phone, position: s.position })));
  many('deliveryZone', plan.zones);
  many('deliveryRun', plan.runs);
  many('cashRemittance', plan.remittances);
  many('order', plan.orders.map(({ items, statusChanges, events, ...o }) => o));
  many('orderItem', plan.orders.flatMap((o) => o.items.map(({ drinks, ...l }) => ({ ...l, orderId: o.id }))));
  many('orderItemDrink', plan.orders.flatMap((o) => o.items.flatMap((l) => l.drinks.map((d) => ({ ...d, orderItemId: l.id })))));
  many('orderStatusChange', plan.orders.flatMap((o) => o.statusChanges.map((c) => ({ ...c, orderId: o.id }))));
  many('orderEvent', plan.orders.flatMap((o) => o.events.map((e) => ({ ...e, orderId: o.id }))));
  many('orderReview', plan.reviews);
  ops.push(prisma.deliveryContractTerms.create({ data: plan.terms }));
  ops.push(prisma.deliveryCompany.upsert({ where: { id: 1 }, create: { id: 1, ...DEMO_COMPANY, updatedByName: 'Prestataire (Démo)' }, update: { ...DEMO_COMPANY, updatedByName: 'Prestataire (Démo)' } }));
  ops.push(prisma.deliverySettings.upsert({ where: { id: 1 }, create: { id: 1, ...DEMO_NIGHT }, update: DEMO_NIGHT }));
  for (const key of DEMO_FEATURES) {
    ops.push(prisma.featureSwitch.upsert({ where: { key }, create: { key, enabled: true, updatedByName: 'Prestataire (Démo)' }, update: { enabled: true, updatedByName: 'Prestataire (Démo)' } }));
  }
  return ops;
}

function printSummary(plan, s, check, before) {
  console.log(`\n── Essai à blanc : ce qui serait écrit dans dev ──`);
  console.log(`Période : ${s.period}`);
  console.log(`Commandes : ${s.orders} (lignes de plats ${s.items}, étapes ${s.statusChanges}, événements ${s.events})`);
  console.log(`Ventes (payées) : ${s.sales.count} commandes, ${s.sales.amount}, panier moyen ${s.sales.average}`);
  console.log(`Livraison ${s.modes.livraison} (restaurant ${s.modes.restaurant}, Prestataire ${s.modes.prestataire}) · à emporter ${s.modes.emporter}`);
  console.log(`Provenance : site ${s.sources.site} · appel ${s.sources.appel} · WhatsApp ${s.sources.whatsapp}`);
  console.log(`Paiement des plats : Orange ${s.payments.ORANGE_MONEY} · Moov ${s.payments.MOOV_MONEY} · Telecel ${s.payments.TELECEL_MONEY}`);
  console.log(`Annulées : ${s.cancelled} · livraisons offertes : ${s.free} · supplément de nuit : ${s.night} · frais fixés par l'agent : ${s.agentFees}`);
  console.log(`Frais de livraison des commandes livrées : ${s.fees}`);
  console.log(`Caisse : espèces ${s.cash.especes} (remises ${s.cash.remittances}, encore chez les livreurs ${s.cash.notRemitted}) · mobile money ${s.cash.mobile} (à vérifier ${s.cash.toVerify})`);
  console.log(`Tournées Prestataire : ${s.runs.count} (dont ${s.runs.multi} avec plusieurs commandes) · récupérées par la responsable : ${s.pickedByManager} · livrées sans code : ${s.noCode}`);
  console.log(`Avis : ${s.reviews.count} (mauvais ${s.reviews.low} : rappelés ${s.reviews.calledBack}, à rappeler ${s.reviews.toCall})`);
  console.log(`En cours maintenant : ${Object.entries(s.inProgress).map(([k, v]) => `${k} ${v}`).join(' · ')} · livrées à remercier ${check.pendingThanks}`);
  console.log(`\nCommandes par jour :\n  ${s.days.join('\n  ')}`);
  console.log(`\nCommandes par heure (0 h → 23 h) :\n  ${s.byHour.map((n, h) => `${h}h:${n}`).join('  ')}`);
  console.log(`\nComptes « Démo » (12) : Patron, 3 agents, 3 livreurs du restaurant, 1 responsable livraison, 4 livreurs de notre équipe`);
  console.log(`Réglages de dev changés pendant la démonstration (remis comme avant à l'effacement) :`);
  console.log(`  société de livraison : ${before.company} → mode Prestataire, « ${DEMO_COMPANY.companyName} », nom affiché « ${DEMO_COMPANY.merchantName} », codes ${DEMO_COMPANY.orangeCode} …`);
  console.log(`  supplément de nuit : ${before.night} → allumé de 23 h à 6 h (500 F par quartier payant)`);
  console.log(`  grille des frais : ${before.zones} → + ${plan.zones.length} quartiers de la démonstration (${plan.zones.filter((z) => z.fee === 0).map((z) => z.name).join(', ')} offert ; 500, 1 000 ou 1 500 F ailleurs ; +500 F la nuit), rangés après les quartiers existants`);
  console.log(`  interrupteurs : ${before.features}`);
  console.log(`  conditions du contrat : 500 F par livraison, 300 F par livraison offerte, « ${DEMO_TERMS_NOTE} », à partir du ${plan.period.switchAt.toISOString().slice(0, 10)}`);
  console.log(`\nVérifications (règles de l'équipe rejouées) : ${check.errors.length ? `${check.errors.length} ERREUR(S)` : 'toutes les étapes sont permises, prix identiques au serveur'}`);
}

async function main() {
  assertDev();
  const found = await alreadyThere();
  if (found.length) stop(`une démonstration semble déjà en place (${found.join(' ; ')}). Lancez d'abord npm run demo:effacer.`);

  const products = await prisma.product.findMany({ include: { variants: true, category: true } });
  const plan = generatePlan({ products, now: new Date() });
  const check = checkPlan(plan, products);
  const existingTerms = await prisma.deliveryContractTerms.findMany({ select: { validFrom: true } });
  if (existingTerms.some((t) => t.validFrom.getTime() === plan.terms.validFrom.getTime())) {
    stop('une version des conditions du contrat commence déjà le même jour sur dev.');
  }

  const company = await prisma.deliveryCompany.findUnique({ where: { id: 1 } });
  const night = await prisma.deliverySettings.findUnique({ where: { id: 1 } });
  const features = await prisma.featureSwitch.findMany({ where: { key: { in: DEMO_FEATURES } } });
  const zones = await prisma.deliveryZone.findMany();
  const bands = await prisma.deliveryDistanceBand.count();
  const before = {
    company: company ? `mode ${company.mode}` : 'aucune (mode Restaurant)',
    night: night?.nightEnabled ? 'allumé' : 'éteint',
    zones: `${zones.length} quartier(s) (${zones.filter((z) => z.isActive).length} actif(s)), ${bands} tranche(s) de distance`,
    features: DEMO_FEATURES.map((k) => `${k} ${features.find((f) => f.key === k) ? (features.find((f) => f.key === k).enabled ? 'ouvert' : 'fermé') : 'sans ligne'}`).join(', ') + ' → tous ouverts',
  };
  if (existingTerms.length) before.features += ` · ATTENTION : ${existingTerms.length} version(s) des conditions déjà sur dev`;
  printSummary(plan, summarize(plan), check, before);
  if (check.errors.length) {
    console.log(check.errors.slice(0, 30).join('\n'));
    stop('le plan ne respecte pas les règles : rien n’est écrit.');
  }
  if (DRY) {
    console.log('\nEssai à blanc : RIEN n’a été écrit dans la base.');
    return;
  }

  // Mots de passe : celui du Patron (Démo) tapé ici ; les autres tirés au hasard, jamais affichés
  const patronPassword = await askPassword();
  const { randomBytes } = await import('node:crypto');
  const passwords = new Map();
  for (const s of plan.staff) passwords.set(s.id, await hashPassword(s.key === 'patron' ? patronPassword : randomBytes(18).toString('base64url')));

  console.log('\nPhoto de dev avant la démonstration…');
  const photo = await takePhoto(prisma);
  mkdirSync(PHOTO_DIR, { recursive: true });
  const photoPath = join(PHOTO_DIR, PHOTO_FILE);
  writeFileSync(photoPath, JSON.stringify(photoToSave(photo), null, 1));
  console.log(`Photo enregistrée : ${photoPath}`);

  console.log('Écriture dans dev (une seule transaction, tout ou rien)…');
  try {
    await prisma.$transaction(writes(plan, passwords));
  } catch (e) {
    unlinkSync(photoPath); // rien n'a été écrit : la photo ne sert plus
    console.error(e.message);
    stop('écriture refusée par la base : rien n’a été écrit.');
  }
  const written = await prisma.order.count({ where: { reference: { startsWith: DEMO_REF_PREFIX } } });
  console.log(`Terminé : ${written} commandes « Démo » dans dev. Connexion : « Patron (Démo) », téléphone 70 97 00 01.`);
  console.log(`Compte Prestataire de la démonstration (facultatif) : npm run equipe:prestataire, choix 1, nom « ${PRESTATAIRE_DEMO.name} », numéro ${PRESTATAIRE_DEMO.phone}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
