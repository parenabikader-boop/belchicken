// Lot 4 : interrupteurs des fonctions en base (règles dans features.js)
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { FEATURE_CLOSED, FEATURE_KEYS, FEATURES, featureMap } from './features.js';
import { logSecurity } from './security-log.service.js';

export const getFeatures = async (db = prisma) => featureMap(await db.featureSwitch.findMany());

export const isFeatureOpen = async (key, db = prisma) => (await getFeatures(db))[key];

export const featureClosedError = () => new AppError(403, FEATURE_CLOSED, 'FONCTION_NON_INCLUSE');

// Page Prestataire : chaque fonction, ouverte ou non, avec qui l'a changée en dernier
export async function listFeatures() {
  const rows = await prisma.featureSwitch.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return FEATURES.map((f) => {
    const row = byKey.get(f.key);
    return { ...f, enabled: row?.enabled ?? true, updatedByName: row?.updatedByName ?? null, updatedAt: row?.updatedAt ?? null };
  });
}

// Ouvrir ou fermer une fonction : noté au journal (avant, après), dans la même transaction
export async function setFeature(key, enabled, staff, meta) {
  if (!FEATURE_KEYS.includes(key)) throw new AppError(404, 'Fonction inconnue.', 'FONCTION_INCONNUE');
  await prisma.$transaction(async (tx) => {
    const before = (await getFeatures(tx))[key];
    if (before === enabled) return;
    await tx.featureSwitch.upsert({ where: { key }, create: { key, enabled, updatedByName: staff.name }, update: { enabled, updatedByName: staff.name } });
    await logSecurity({ type: 'INTERRUPTEUR', actor: staff, featureKey: key, before, after: enabled, meta }, tx);
  });
  return listFeatures();
}
