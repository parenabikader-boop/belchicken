// Grille des frais de livraison : lecture pour le site et les commandes, réglages du Patron
// (règles et calculs dans delivery-fees.js)
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { sameItems } from './menu-edit.js';
import { featureClosedError, getFeatures } from './features.service.js';
import {
  activeGrid, bandRanges, expectedFeeError, INDEPENDENT_GRID, isNightTime, minutesToHHMM, publicGrid, sameZoneName,
} from './delivery-fees.js';
import { getDeliveryMode } from './delivery-mode.service.js';
import { MAX_ACCURACY_METERS } from './delivery-fees.js';
import { FEES_BY_KM, ROAD_BANDS, SIMPLE_ORDER } from './features.js';
import { simpleQuoteCheck } from './simple-order.js';
import { kmActive, NEED_ACCEPT, publicGridWith, quoteWith, staffKm } from './delivery-km.js';
import { roadDistance } from './route-distance.service.js';

// Lot 4 : supplément de nuit fermé par le Prestataire = comme si le Patron l'avait éteint (nightIncluded)
async function readGrid(db = prisma) {
  const [zones, bands, stored, features] = await Promise.all([
    db.deliveryZone.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    db.deliveryDistanceBand.findMany({ orderBy: { upToMeters: 'asc' } }),
    db.deliverySettings.findUnique({ where: { id: 1 } }),
    getFeatures(db),
  ]);
  const nightIncluded = features.SUPPLEMENT_NUIT;
  const settings = stored && !nightIncluded ? { ...stored, nightEnabled: false } : stored;
  return { zones, bands, settings, nightIncluded };
}

export const loadGrid = async (db = prisma) => activeGrid(await readGrid(db));

// Plan 3 : grille par km du Patron, si elle est active (interrupteur FRAIS_PAR_KM ouvert ET grille allumée), sinon
// null. La table n'est lue que si l'interrupteur est ouvert : fermé, rien de nouveau n'est demandé à la base.
export async function kmGrid(db = prisma, features = null) {
  const open = (features || (await getFeatures(db)))[FEES_BY_KM];
  if (!open) return null;
  const row = await db.deliveryKmGrid.findUnique({ where: { id: 1 } });
  return kmActive(open, row) ? row : null;
}

// ─── Site public ───

// Livreurs indépendants : aucun prix proposé au client (frais réglés directement au livreur), le site affiche
// la phrase des livreurs indépendants. Autres modes : exactement comme avant.
// Plan 3, grille par km active : position (par la route) ou quartier, jamais « Autre quartier » ; km = à accepter.
export async function getPublicGrid() {
  if ((await getDeliveryMode()) === 'INDEPENDANT') return INDEPENDENT_GRID;
  const [grid, km] = await Promise.all([loadGrid(), kmGrid()]);
  return publicGridWith(publicGrid(grid), km);
}

// Frais pour un choix du client (aperçu sur la page Vos informations, puis à la commande)
// now : heure de la commande, qui décide du supplément de nuit
// Plan 3, grille par km active : quartier choisi = prix du quartier ; sinon distance par la route depuis le restaurant.
export async function quoteFor(choice, location, { legacy = false, now = new Date() } = {}) {
  const features = await getFeatures();
  const [grid, km] = await Promise.all([loadGrid(), legacy ? null : kmGrid(prisma, features)]);
  const quote = await quoteWith(
    { grid, km, choice, location, legacy, restaurant: env.restaurantPosition, now, maxAccuracy: MAX_ACCURACY_METERS, roadBands: features[ROAD_BANDS] },
    (from, to) => roadDistance(from, to),
  );
  // Commande simplifiée (position seule, sans quartier) : un prix calculé, ou « trop loin » / « position imprécise »
  if (features[SIMPLE_ORDER] && !legacy && !choice.zoneId && !choice.other && location) {
    // Distance maximale : celle de la grille par km, sinon la fin de la dernière tranche, sinon 30 km
    const maxKm = km ? km.maxKm ?? null : grid.bands.length ? grid.bands.at(-1).upToMeters / 1000 : null;
    const bad = simpleQuoteCheck(quote, { location, maxKm, maxAccuracy: MAX_ACCURACY_METERS });
    if (bad) throw new AppError(400, bad.error, bad.code, { km: bad.km, path: 'delivery' });
  }
  if (quote.error) throw new AppError(400, quote.error, 'FRAIS_LIVRAISON', [{ path: 'delivery', message: quote.error }]);
  return quote;
}

// À la commande : le montant affiché au client doit être celui que le serveur trouve (un supplément de
// nuit commencé entre l'aperçu et la validation est un changement de frais, comme un prix changé)
// Plan 3 : avec la grille par km, le client doit avoir accepté le montant (expectedFee) avant de payer.
export async function quoteForOrder(choice, location, now = new Date()) {
  const quote = await quoteFor(choice || {}, location, { legacy: !choice, now });
  if (quote.kmMode && choice?.expectedFee === undefined) {
    throw new AppError(400, NEED_ACCEPT, 'FRAIS_A_ACCEPTER', [{ path: 'delivery', message: NEED_ACCEPT }]);
  }
  const changed = expectedFeeError(quote, choice?.expectedFee);
  if (changed) throw new AppError(409, changed, 'FRAIS_CHANGES', { quote: publicQuote(quote) });
  return quote;
}

// Ce que le client voit de l'aperçu (la distance arrondie, sans position)
export const publicQuote = (q) => ({
  source: q.source,
  fee: q.fee,
  zoneName: q.zoneName,
  distanceKm: q.distanceM != null ? Math.round(q.distanceM / 100) / 10 : null,
  ...(q.nightFee ? { nightFee: q.nightFee } : {}), // lot 3 : part du supplément de nuit dans fee
  // Plan 3 : grille par km active (montant à accepter) ; distance estimée faute de service
  ...(q.kmMode && { kmMode: true }),
  ...((q.source === 'KM_ESTIMATION' || q.roadEstimated) && { estimate: true }),
});

// Heures de nuit réglées et « c'est la nuit maintenant » (null = réglage éteint) : rappel à l'agent qui
// saisit des frais à confirmer, et commande passée de nuit (heure de la commande)
export async function nightInfo(at = new Date()) {
  const { night } = await loadGrid();
  if (!night) return null;
  return { from: minutesToHHMM(night.startMin), to: minutesToHHMM(night.endMin), isNight: isNightTime(night, at), startMin: night.startMin, endMin: night.endMin };
}

// ─── Page « Frais de livraison » du Patron ───

export async function getStaffGrid() {
  const { zones, bands, settings, nightIncluded } = await readGrid();
  // Plan 3 : grille par km, seulement quand l'interrupteur est ouvert (sinon la page est celle d'avant)
  const staffFeatures = await getFeatures();
  const kmOpen = staffFeatures[FEES_BY_KM];
  const roadBands = staffFeatures[ROAD_BANDS];
  const kmRow = kmOpen ? await prisma.deliveryKmGrid.findUnique({ where: { id: 1 } }) : null;
  const active = activeGrid({ zones, bands, settings });
  const ranges = new Map(bandRanges(active.bands).map((b) => [b.id, b.fromMeters]));
  return {
    zones: zones.map((z) => ({ id: z.id, name: z.name, fee: z.fee, nightFee: z.nightFee, isActive: z.isActive, position: z.position })),
    bands: bands.map((b) => ({
      id: b.id, upToMeters: b.upToMeters, fromMeters: ranges.get(b.id) ?? null, fee: b.fee, nightFee: b.nightFee, isActive: b.isActive,
    })),
    settings: {
      allowOtherZone: active.allowOther,
      // Lot 3 : heures de nuit (réglées même quand le supplément est éteint)
      nightEnabled: settings?.nightEnabled ?? false,
      nightIncluded, // lot 4 : fermé par le Prestataire = non inclus dans la formule
      nightStart: minutesToHHMM(settings?.nightStartMin ?? 1320),
      nightEnd: minutesToHHMM(settings?.nightEndMin ?? 360),
      isNight: isNightTime(active.night),
    },
    isEmpty: active.isEmpty,
    restaurant: env.restaurantPosition,
    ...(kmOpen && { km: { ...staffKm(kmRow), routeService: Boolean(env.openRouteServiceKey) } }),
    // Tranches mesurées par la route (interrupteur TRANCHES_PAR_ROUTE ; rien sinon, comme avant)
    ...(roadBands && { roadBands: { routeService: Boolean(env.openRouteServiceKey) } }),
  };
}

// Plan 3 : grille par km du Patron (interrupteur FRAIS_PAR_KM ouvert, sinon 403)
export async function setKmGrid(input, staff) {
  if (!(await getFeatures())[FEES_BY_KM]) throw featureClosedError();
  const data = { ...input, maxKm: input.maxKm ?? null, updatedByName: staff.name };
  await prisma.deliveryKmGrid.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return getStaffGrid();
}

async function checkZoneName(name, exceptId = null) {
  const zones = await prisma.deliveryZone.findMany({ select: { id: true, name: true } });
  const taken = zones.find((z) => z.id !== exceptId && sameZoneName(z.name, name));
  if (taken) throw new AppError(409, `Le quartier « ${taken.name} » existe déjà.`, 'QUARTIER_EXISTANT');
}

const findZone = async (id) => {
  const zone = await prisma.deliveryZone.findUnique({ where: { id: String(id) } });
  if (!zone) throw new AppError(404, 'Quartier introuvable.', 'QUARTIER_INTROUVABLE');
  return zone;
};

export async function createZone(input) {
  await checkZoneName(input.name);
  const last = await prisma.deliveryZone.aggregate({ _max: { position: true } });
  await prisma.deliveryZone.create({ data: { ...input, position: (last._max.position ?? -1) + 1 } });
  return getStaffGrid();
}

export async function updateZone(id, input) {
  await findZone(id);
  if (input.name) await checkZoneName(input.name, String(id));
  await prisma.deliveryZone.update({ where: { id: String(id) }, data: input });
  return getStaffGrid();
}

export async function reorderZones(ids) {
  const current = await prisma.deliveryZone.findMany({ select: { id: true } });
  if (!sameItems(current.map((z) => z.id), ids)) {
    throw new AppError(409, 'La liste des quartiers a changé entre-temps. Rechargez la page.', 'ORDRE_PERIME');
  }
  await prisma.$transaction(ids.map((id, position) => prisma.deliveryZone.update({ where: { id }, data: { position } })));
  return getStaffGrid();
}

// Deux tranches ne peuvent pas finir à la même distance (contrainte unique en base)
const bandTaken = (e) => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError(409, 'Une tranche finit déjà à cette distance.', 'TRANCHE_EXISTANTE');
  }
  return e;
};

export async function createBand(input) {
  await prisma.deliveryDistanceBand.create({ data: input }).catch((e) => { throw bandTaken(e); });
  return getStaffGrid();
}

export async function updateBand(id, input) {
  const band = await prisma.deliveryDistanceBand.findUnique({ where: { id: String(id) } });
  if (!band) throw new AppError(404, 'Tranche introuvable.', 'TRANCHE_INTROUVABLE');
  await prisma.deliveryDistanceBand.update({ where: { id: band.id }, data: input }).catch((e) => { throw bandTaken(e); });
  return getStaffGrid();
}

// Une tranche n'est liée à aucune commande (la distance et le montant y sont copiés) : supprimable
export async function deleteBand(id) {
  const deleted = await prisma.deliveryDistanceBand.deleteMany({ where: { id: String(id) } });
  if (!deleted.count) throw new AppError(404, 'Tranche introuvable.', 'TRANCHE_INTROUVABLE');
  return getStaffGrid();
}

// Seulement les champs envoyés (le reste garde sa valeur, ou la valeur par défaut à la création)
export async function setSettings({ allowOtherZone, nightEnabled, nightStart, nightEnd }) {
  if (nightEnabled === true && !(await getFeatures()).SUPPLEMENT_NUIT) throw featureClosedError();
  const data = Object.fromEntries(
    Object.entries({ allowOtherZone, nightEnabled, nightStartMin: nightStart, nightEndMin: nightEnd }).filter(([, v]) => v !== undefined),
  );
  const current = await prisma.deliverySettings.findUnique({ where: { id: 1 } });
  const start = data.nightStartMin ?? current?.nightStartMin ?? 1320;
  const end = data.nightEndMin ?? current?.nightEndMin ?? 360;
  if (start === end) throw new AppError(400, 'Le début et la fin de la nuit doivent être différents.', 'HEURES_NUIT');
  await prisma.deliverySettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return getStaffGrid();
}
