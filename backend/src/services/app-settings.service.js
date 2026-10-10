// Réglages du logiciel (une seule ligne AppSettings, id = 1). Pas de ligne = tout éteint : chaque nouveauté
// de la feuille de route (docs/feuille-de-route.md) reste derrière son interrupteur, éteint par défaut.
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { featureClosedError, getFeatures } from './features.service.js';

export const DEFAULT_SETTINGS = { shortFlow: false, agentOrders: false, restaurantDispatch: false };

export const settingsSchema = z.object({
  shortFlow: z.boolean().optional(),
  // Lot 2 : prise de commande par l'agent (appel, WhatsApp)
  agentOrders: z.boolean().optional(),
  // Lot 5b : tournées et disponibilité des livreurs du restaurant (mode Restaurant)
  restaurantDispatch: z.boolean().optional(),
});

// Lot 4 : réglage et fonction du Prestataire qui l'inclut. Fermée = comme si le Patron l'avait éteint
// (son choix est gardé et revient quand la fonction est rouverte).
const FEATURE_OF = { shortFlow: 'PARCOURS_COURT', agentOrders: 'PRISE_COMMANDE_AGENT', restaurantDispatch: 'TOURNEES_RESTAURANT' };

// included : réglages compris dans la formule (la page Réglages montre les autres comme non inclus)
const toPublic = (row, features) => {
  const included = Object.fromEntries(Object.entries(FEATURE_OF).map(([name, key]) => [name, features[key]]));
  return {
    shortFlow: (row?.shortFlow ?? DEFAULT_SETTINGS.shortFlow) && included.shortFlow,
    agentOrders: (row?.agentOrders ?? DEFAULT_SETTINGS.agentOrders) && included.agentOrders,
    restaurantDispatch: (row?.restaurantDispatch ?? DEFAULT_SETTINGS.restaurantDispatch) && included.restaurantDispatch,
    included,
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
};

export async function getAppSettings(db = prisma) {
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  return toPublic(row, await getFeatures(db));
}

export async function setAppSettings(input, staff) {
  const features = await getFeatures();
  if (Object.entries(FEATURE_OF).some(([name, key]) => input[name] === true && !features[key])) throw featureClosedError();
  const data = { ...input, updatedByName: staff.name };
  return toPublic(await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data }), features);
}
