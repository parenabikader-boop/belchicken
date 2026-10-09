// Provenances (Patron) et prise de commande par l'agent (lot 2). Règles sans base : order-sources.js.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { getAppSettings } from './app-settings.service.js';
import { createOrder } from './order.service.js';
import { getOrder } from './staff-orders.service.js';
import { agentChoices, agentSourceError, customerPrefill, sameSourceName, siteLockedError, sourceDeleteError } from './order-sources.js';

const AGENT_OFF = 'La prise de commande par l’agent est éteinte. Le Patron peut l’allumer dans Réglages.';
const NOT_FOUND = () => new AppError(404, 'Provenance introuvable.', 'PROVENANCE_INTROUVABLE');

async function requireAgentOrders() {
  if (!(await getAppSettings()).agentOrders) throw new AppError(403, AGENT_OFF, 'SAISIE_ETEINTE');
}

// ─────────── Page Réglages du Patron ───────────

// Toutes les provenances, avec le nombre de commandes de chacune (une provenance utilisée ne se supprime pas)
export async function listSources() {
  const sources = await prisma.orderSource.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { orders: true } } },
  });
  return sources.map(({ _count, ...s }) => ({ ...s, ordersCount: _count.orders }));
}

async function checkName(name, exceptId = null) {
  const all = await prisma.orderSource.findMany({ select: { id: true, name: true } });
  if (all.some((s) => s.id !== exceptId && sameSourceName(s.name, name))) {
    throw new AppError(409, `La provenance « ${name} » existe déjà.`, 'PROVENANCE_EN_DOUBLE');
  }
}

async function findSource(id) {
  const source = await prisma.orderSource.findUnique({ where: { id } });
  if (!source) throw NOT_FOUND();
  return source;
}

export async function createSource(input) {
  await checkName(input.name);
  const last = await prisma.orderSource.aggregate({ _max: { position: true } });
  await prisma.orderSource.create({ data: { ...input, position: (last._max.position ?? 0) + 1 } });
  return listSources();
}

export async function updateSource(id, input) {
  const source = await findSource(id);
  const locked = siteLockedError(source);
  if (locked) throw new AppError(400, locked, 'PROVENANCE_FIXE');
  await checkName(input.name, id);
  await prisma.orderSource.update({ where: { id }, data: input });
  return listSources();
}

export async function setSourceActive(id, isActive) {
  const source = await findSource(id);
  const locked = siteLockedError(source);
  if (locked) throw new AppError(400, locked, 'PROVENANCE_FIXE');
  await prisma.orderSource.update({ where: { id }, data: { isActive } });
  return listSources();
}

export async function deleteSource(id) {
  const source = await findSource(id);
  const used = await prisma.order.count({ where: { sourceId: id } });
  const error = sourceDeleteError(source, used);
  if (error) throw new AppError(400, error, 'SUPPRESSION_IMPOSSIBLE');
  try {
    await prisma.orderSource.delete({ where: { id } });
  } catch (e) {
    // Commande saisie entre-temps avec cette provenance
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw new AppError(400, `« ${source.name} » vient de servir pour une commande : désactivez-la plutôt.`, 'SUPPRESSION_IMPOSSIBLE');
    }
    throw e;
  }
  return listSources();
}

// Nouvel ordre (identifiants dans l'ordre voulu). « Site » reste en tête.
export async function reorderSources(ids) {
  const sources = await prisma.orderSource.findMany({ select: { id: true, kind: true } });
  const known = new Set(sources.map((s) => s.id));
  if (ids.length !== sources.length || !ids.every((id) => known.has(id)) || new Set(ids).size !== ids.length) {
    throw new AppError(409, 'La liste des provenances a changé. La page est mise à jour.', 'LISTE_CHANGEE');
  }
  const site = sources.filter((s) => s.kind === 'SITE').map((s) => s.id);
  const ordered = [...site, ...ids.filter((id) => !site.includes(id))];
  await prisma.$transaction(ordered.map((id, position) => prisma.orderSource.update({ where: { id }, data: { position } })));
  return listSources();
}

// ─────────── Prise de commande par l'agent ───────────

// Ce qu'il faut à la page « Nouvelle commande » : le réglage et les provenances proposées (jamais « Site »)
export async function agentContext() {
  const { agentOrders } = await getAppSettings();
  if (!agentOrders) return { enabled: false, sources: [] };
  return { enabled: true, sources: agentChoices(await prisma.orderSource.findMany()) };
}

// Client retrouvé par son numéro (déjà normalisé) : nom, quartier et repères de ses dernières commandes
export async function findCustomer(phone) {
  await requireAgentOrders();
  const where = { customerPhone: phone };
  const [orders, count, zones] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { customerName: true, mode: true, addressNote: true, deliveryZoneId: true, deliveryZoneName: true, createdAt: true },
    }),
    prisma.order.count({ where }),
    prisma.deliveryZone.findMany({ where: { isActive: true }, select: { id: true } }),
  ]);
  return customerPrefill(orders, count, new Set(zones.map((z) => z.id)));
}

// Commande saisie par l'agent : provenance vérifiée ici (jamais « Site »), puis le même enregistrement
// que le site (prix et frais calculés par le serveur, départ « paiement à vérifier »)
export async function createAgentOrder(input, staff) {
  await requireAgentOrders();
  const source = await prisma.orderSource.findUnique({ where: { id: input.sourceId } });
  const error = agentSourceError(source);
  if (error) throw new AppError(400, error, 'PROVENANCE_REFUSEE');
  const order = await createOrder(input, { source, staff });
  return getOrder(order.reference);
}
