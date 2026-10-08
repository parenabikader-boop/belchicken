// Réglages du logiciel (une seule ligne AppSettings, id = 1). Pas de ligne = tout éteint : chaque nouveauté
// de la feuille de route (docs/feuille-de-route.md) reste derrière son interrupteur, éteint par défaut.
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const DEFAULT_SETTINGS = { shortFlow: false };

export const settingsSchema = z.object({
  shortFlow: z.boolean().optional(),
});

const toPublic = (row) => ({
  shortFlow: row?.shortFlow ?? DEFAULT_SETTINGS.shortFlow,
  updatedByName: row?.updatedByName ?? null,
  updatedAt: row?.updatedAt ?? null,
});

export async function getAppSettings(db = prisma) {
  return toPublic(await db.appSettings.findUnique({ where: { id: 1 } }));
}

export async function setAppSettings(input, staff) {
  const data = { ...input, updatedByName: staff.name };
  return toPublic(await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data }));
}
