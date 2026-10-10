// Grille des frais de livraison : lecture pour le site et les commandes, réglages du Patron
// (règles et calculs dans delivery-fees.js)
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { sameItems } from './menu-edit.js';
import { featureClosedError, getFeatures } from './features.service.js';
import {
  activeGrid, bandRanges, expectedFeeError, isNightTime, minutesToHHMM, publicGrid, quoteDelivery, sameZoneName,
} from './delivery-fees.js';

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

// ─── Site public ───

export const getPublicGrid = async () => publicGrid(await loadGrid());

// Frais pour un choix du client (aperçu sur la page Vos informations, puis à la commande)
// now : heure de la commande, qui décide du supplément de nuit
export async function quoteFor(choice, location, { legacy = false, now = new Date() } = {}) {
  const quote = quoteDelivery(await loadGrid(), { ...choice, location, legacy }, env.restaurantPosition, now);
  if (quote.error) throw new AppError(400, quote.error, 'FRAIS_LIVRAISON', [{ path: 'delivery', message: quote.error }]);
  return quote;
}

// À la commande : le montant affiché au client doit être celui que le serveur trouve (un supplément de
// nuit commencé entre l'aperçu et la validation est un changement de frais, comme un prix changé)
export async function quoteForOrder(choice, location, now = new Date()) {
  const quote = await quoteFor(choice || {}, location, { legacy: !choice, now });
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
  };
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
