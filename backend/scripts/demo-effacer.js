// Démonstration commerciale : efface TOUTE la démonstration de la base DEV, et seulement elle, puis remet les
// réglages et la grille des frais exactement comme avant, et compare dev avec la photo prise avant le remplissage.
// npm run demo:effacer (dans backend/). Sans question : npm run demo:effacer -- --oui
//
// Ne supprime une donnée que si toutes ses marques « Démo » sont présentes (demo-commun.js), compte
// « Prestataire (Démo) » compris. Si quelque chose est douteux (ex. une vraie commande de dev liée à un compte
// « Démo »), s'arrête sans rien effacer.
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { Prisma } from '@prisma/client';
import { createPrompt } from './prompt.js';
import { assertDev, photoSince, takePhoto } from './demo-photo.js';
import {
  CUSTOMER_PHONE_PREFIX, DEMO_REF_PREFIX, DEMO_SOURCES, DEMO_TERMS_NOTE, DEMO_ZONES, PHOTO_DIR, PHOTO_FILE, RESTORED_TABLES,
  STAFF_PHONE_PREFIX, comparePhotos, photoColumns, withAddedDefaults, isDemoAvailabilityChange, isDemoOrder, isDemoRemittance, isDemoRun, isDemoSource, isDemoStaff,
  isDemoTerms, isDemoZone, isLiveTestOrder,
} from './demo-commun.js';

const YES = process.argv.includes('--oui');

function stop(text) {
  console.error(`\nARRÊT : ${text}\nRien n'a été effacé.`);
  process.exit(1);
}

async function main() {
  assertDev();
  const photoPath = join(PHOTO_DIR, PHOTO_FILE);
  if (!existsSync(photoPath)) stop(`photo d'avant la démonstration introuvable (${photoPath}).`);
  const photo = JSON.parse(readFileSync(photoPath, 'utf8'));

  // Tout ce qui porte une marque, puis contrôle que chaque élément porte TOUTES ses marques
  const orders = await prisma.order.findMany({
    where: { OR: [{ reference: { startsWith: DEMO_REF_PREFIX } }, { customerPhone: { startsWith: CUSTOMER_PHONE_PREFIX } }] },
    select: { id: true, reference: true, customerName: true, customerPhone: true },
  });
  const staff = await prisma.staffUser.findMany({ where: { phone: { startsWith: STAFF_PHONE_PREFIX } }, select: { id: true, name: true, phone: true } });
  const sources = await prisma.orderSource.findMany({ where: { name: { in: DEMO_SOURCES.map((s) => s.name) } } });
  const staffIds = staff.map((s) => s.id);
  const runs = await prisma.deliveryRun.findMany({ where: { OR: [{ courierId: { in: staffIds } }, { createdById: { in: staffIds } }, { courierName: { endsWith: '(Démo)' } }] } });
  const remittances = await prisma.cashRemittance.findMany({ where: { OR: [{ courierId: { in: staffIds } }, { receivedById: { in: staffIds } }, { courierName: { endsWith: '(Démo)' } }] } });
  const terms = await prisma.deliveryContractTerms.findMany({ where: { note: DEMO_TERMS_NOTE } });
  const zones = await prisma.deliveryZone.findMany({ where: { name: { in: DEMO_ZONES.map((z) => z.name) } } });
  const availability = await prisma.courierAvailabilityChange.findMany({ where: { OR: [{ courierId: { in: staffIds } }, { courierName: { endsWith: '(Démo)' } }] } });
  // Commandes passées en direct sur le site local pendant les essais (client « … (Démo) », 70 98 xx xx)
  const live = orders.filter(isLiveTestOrder);

  const doubts = [
    ...orders.filter((o) => !isDemoOrder(o) && !isLiveTestOrder(o)).map((o) => `commande ${o.reference} sans toutes les marques`),
    ...availability.filter((c) => !isDemoAvailabilityChange(c)).map((c) => `disponibilité de ${c.courierName} changée par ${c.byName} (hors « Démo »)`),
    ...staff.filter((s) => !isDemoStaff(s)).map((s) => `compte ${s.name} sans la marque « (Démo) »`),
    ...sources.filter((s) => !isDemoSource(s)).map((s) => `provenance ${s.name}`),
    ...runs.filter((r) => !isDemoRun(r)).map((r) => `tournée de ${r.courierName} sans toutes les marques`),
    ...remittances.filter((r) => !isDemoRemittance(r)).map((r) => `remise d'espèces de ${r.courierName} sans toutes les marques`),
    ...terms.filter((t) => !isDemoTerms(t)).map((t) => `conditions du ${t.validFrom.toISOString().slice(0, 10)} sans toutes les marques`),
    ...zones.filter((z) => !isDemoZone(z)).map((z) => `quartier ${z.name} rangé hors des places de la démonstration`),
  ];
  // Une vraie commande de dev liée à la démonstration (compte, provenance, tournée, remise ou quartier « Démo ») ?
  const orderIds = orders.map((o) => o.id);
  const zoneIds = zones.map((z) => z.id);
  const linked = await prisma.order.findMany({
    where: {
      id: { notIn: orderIds },
      OR: [
        { courierId: { in: staffIds } }, { createdById: { in: staffIds } }, { sourceId: { in: sources.map((s) => s.id) } },
        { deliveryRunId: { in: runs.map((r) => r.id) } }, { cashRemittanceId: { in: remittances.map((r) => r.id) } },
        { deliveryZoneId: { in: zoneIds } },
      ],
    },
    select: { reference: true },
  });
  doubts.push(...linked.map((o) => `la commande ${o.reference} (hors démonstration) est liée à la démonstration`));
  if (doubts.length) stop(`données douteuses :\n  ${doubts.slice(0, 20).join('\n  ')}`);

  // Réglages et grille : chaque ligne remise comme sur la photo ; les lignes apparues depuis sont supprimées
  const restoreOps = [];
  const extra = [];
  for (const { model, key } of RESTORED_TABLES) {
    const before = photo.settings?.[model];
    if (!before) stop(`la photo ne contient pas ${model} (photo d'une ancienne version du script).`);
    const keep = new Set(before.map((r) => r[key]));
    const current = await prisma[model].findMany();
    const gone = current.filter((r) => !keep.has(r[key]) && !(model === 'deliveryZone' && zoneIds.includes(r.id)));
    for (const r of gone) extra.push(`${model} « ${r.name ?? r[key]} »`);
    if (gone.length) restoreOps.push(prisma[model].deleteMany({ where: { [key]: { in: gone.map((r) => r[key]) } } }));
    // Colonnes ajoutées depuis la photo (migration) : remises à leur valeur par défaut
    const fields = Prisma.dmmf.datamodel.models.find((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1) === model).fields;
    for (const row of before) {
      const data = withAddedDefaults(revive(row), fields);
      restoreOps.push(prisma[model].upsert({ where: { [key]: row[key] }, create: data, update: data }));
    }
  }

  if (live.length) console.log(`\nCommandes passées en direct pendant les essais (client « Démo ») : ${live.map((o) => o.reference).join(', ')}.`);
  console.log(`\nÀ effacer : ${orders.length} commandes (avec leurs plats, historique, événements, avis), ${runs.length} tournées,`);
  console.log(`${remittances.length} remises d'espèces, ${terms.length} version(s) des conditions, ${sources.length} provenances, ${zones.length} quartiers,`);
  console.log(`${availability.length} changement(s) de disponibilité des livreurs,`);
  console.log(`${staff.length} comptes : ${staff.map((s) => s.name).join(', ')}.`);
  console.log(`Réglages, interrupteurs, société de livraison et grille des frais remis comme sur la photo du ${photo.takenAt}.`);
  if (extra.length) console.log(`Lignes apparues depuis la photo, supprimées : ${extra.join(', ')}.`);
  if (!YES) {
    const prompt = createPrompt();
    const answer = await prompt.ask('Tapez EFFACER pour confirmer : ');
    prompt.close();
    if (answer !== 'EFFACER') stop('pas de confirmation.');
  }

  const ops = [
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.deliveryRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } }),
    prisma.cashRemittance.deleteMany({ where: { id: { in: remittances.map((r) => r.id) } } }),
    prisma.deliveryContractTerms.deleteMany({ where: { id: { in: terms.map((t) => t.id) } } }),
    prisma.orderSource.deleteMany({ where: { id: { in: sources.map((s) => s.id) } } }),
    prisma.courierAvailabilityChange.deleteMany({ where: { id: { in: availability.map((c) => c.id) } } }),
    // Comptes : sessions, codes de secours, connexions en cours et téléphones d'alerte partent avec eux
    prisma.staffUser.deleteMany({ where: { id: { in: staffIds } } }),
    prisma.deliveryZone.deleteMany({ where: { id: { in: zoneIds } } }),
    ...restoreOps,
  ];
  console.log('Effacement (une seule transaction, tout ou rien)…');
  await prisma.$transaction(ops);

  // Comparaison avec la photo d'avant
  // (réglages : seulement les colonnes que la photo connaissait, voir photoColumns)
  const after = photoSince(await takePhoto(prisma, new Date(), photoColumns(photo)), photo.takenAt);
  const diffs = comparePhotos(photo, after);
  const blocking = diffs.filter((d) => !d.allowed);
  console.log(`\nComparaison avec la photo d'avant : ${Object.keys(after.tables).length} tables.`);
  for (const d of diffs) console.log(`  ${d.allowed ? 'note' : 'DIFFÉRENCE'} ${d.table} : ${d.text}`);
  if (blocking.length) {
    console.log(`\n${blocking.length} table(s) différente(s) de la photo : à regarder (la photo est gardée).`);
    process.exitCode = 1;
    return;
  }
  console.log('  Toutes les autres tables sont identiques à la photo d’avant la démonstration.');
  const kept = join(PHOTO_DIR, `photo-utilisee-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
  renameSync(photoPath, kept);
  console.log(`Dev est revenue à son état d'avant. Photo gardée sous ${kept}.`);
}

// Dates de la photo (texte) remises en dates
function revive(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v) ? new Date(v) : v;
  return out;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
