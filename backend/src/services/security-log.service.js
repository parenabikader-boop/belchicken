// Lot 4 : journal de sécurité. On ne fait qu'y ajouter des lignes : la base refuse toute modification
// ou suppression (règle PostgreSQL, migration 20261009220000_compte_prestataire), et aucune adresse
// de l'API ne le modifie. Les noms sont copiés : supprimer un compte n'efface rien du journal.
import { prisma } from '../lib/prisma.js';
import { FEATURES } from './features.js';

const FEATURE_LABEL = Object.fromEntries(FEATURES.map((f) => [f.key, f.label]));

export const JOURNAL_PAGE_SIZE = 30;

// Qui agit, et depuis où (adresse IP et navigateur, coupés pour rester lisibles)
export const requestMeta = (req) => ({ ip: req?.ip?.slice(0, 64) || null, userAgent: req?.get?.('user-agent')?.slice(0, 300) || null });

export function logSecurity({ type, actor, featureKey, before, after, detail, meta }, db = prisma) {
  return db.securityLog.create({
    data: {
      type,
      actorName: actor?.name ?? null,
      actorPhone: actor?.phone ?? null,
      featureKey: featureKey ?? null,
      before: before ?? null,
      after: after ?? null,
      detail: detail?.slice(0, 300) ?? null,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });
}

// Page n (1 = la plus récente) du journal, en lecture seule
export async function listSecurityLog(page = 1) {
  const [total, rows] = await Promise.all([
    prisma.securityLog.count(),
    prisma.securityLog.findMany({ orderBy: [{ at: 'desc' }, { id: 'desc' }], skip: (page - 1) * JOURNAL_PAGE_SIZE, take: JOURNAL_PAGE_SIZE }),
  ]);
  const entries = rows.map((r) => ({ ...r, featureLabel: r.featureKey ? FEATURE_LABEL[r.featureKey] || r.featureKey : null }));
  return { entries, page, pages: Math.max(1, Math.ceil(total / JOURNAL_PAGE_SIZE)), total };
}
