// Lot 6 : ventes de Belchicken par période, globales, par provenance et par agent (règles sans base de
// données, testées dans test/sales.test.js ; lectures dans sales.service.js, Excel dans sales-excel.js).
//
// - Une commande compte le jour où elle a été passée (comme le tableau de bord). Heure du Burkina = UTC.
// - Ventes = commandes payées et au-delà (PAID du tableau de bord). Chiffre d'affaires = total des plats.
// - Annulées : comptées à part, jamais dans le chiffre d'affaires. Paiement à vérifier : à part aussi.
// - Frais de livraison : jamais dans les ventes. Ceux du restaurant sont affichés à part (« hors ventes ») ;
//   ceux de notre partenaire (mode Prestataire) n'apparaissent nulle part ici (voir le relevé, lot 5d).
// - Provenance vide = « Site ». Saisie par = Order.createdByName (vide = le client sur le site).
//   Paiement vérifié par = premier passage à « Payée » dans l'historique (parcours court compris).
// - Jamais le nom ni le téléphone du client (accord du client du 11 octobre 2026) : le fichier Excel peut circuler.
import { feeCounted, PAID } from './dashboard.js';
import { SITE_LABEL } from './order-sources.js';
import { statusLabel } from './order-status.js';
import { PAYMENT_LABELS } from '../utils/format.js';
import { DAY, dayKey } from './statement.js';

export const SALE_METHODS = ['ORANGE_MONEY', 'MOOV_MONEY', 'TELECEL_MONEY'];
export const METHOD_LABEL = { ...PAYMENT_LABELS, ESPECES: 'Espèces (anciennes commandes)' };
export const MODE_LABEL = { LIVRAISON: 'Livraison', A_EMPORTER: 'À récupérer' };
const SITE_KEY = 'SITE';

export const isSale = (o) => PAID.includes(o.status);
const isCancelled = (o) => o.status === 'ANNULEE';
const isPending = (o) => o.status === 'PAIEMENT_A_VERIFIER';
const sum = (list) => list.reduce((s, o) => s + o.itemsTotal, 0);
const avg = (list) => (list.length ? Math.round(list.reduce((s, x) => s + x, 0) / list.length) : null);
const amountOf = (list) => ({ count: list.length, amount: sum(list) });

// « 12 min », « 1 h 05 », « — »
export const minutesText = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

// Paiement vérifié : premier passage à « Payée » (statusChanges triés par date)
export function verificationOf(o) {
  const paid = (o.statusChanges || []).find((h) => h.toStatus === 'PAYEE');
  if (!paid) return null;
  return {
    key: paid.staffUserId || `nom:${paid.staffName || '?'}`,
    name: paid.staffName || 'Compte supprimé',
    at: paid.createdAt,
    minutes: Math.max(0, Math.round((new Date(paid.createdAt) - new Date(o.createdAt)) / 60000)),
  };
}

const cancellationOf = (o) => (o.statusChanges || []).findLast((h) => h.toStatus === 'ANNULEE') || null;

// Provenance : la ligne OrderSource (nom actuel) ; vide = Site ; provenance supprimée = son nom copié
export function sourceKey(o) {
  if (o.sourceId && o.source?.kind !== 'SITE') return o.sourceId;
  if (!o.sourceId && o.sourceName) return `nom:${o.sourceName}`;
  return SITE_KEY;
}

// Ventes par mode de paiement des plats : Orange, Moov, Telecel toujours ; espèces seulement s'il y en a
export function byMethod(sales) {
  const out = SALE_METHODS.map((method) => ({ method, label: METHOD_LABEL[method], ...amountOf(sales.filter((o) => o.paymentMethod === method)) }));
  const cash = sales.filter((o) => o.paymentMethod === 'ESPECES');
  if (cash.length) out.push({ method: 'ESPECES', label: METHOD_LABEL.ESPECES, ...amountOf(cash) });
  return out;
}

// Chiffres d'un groupe de commandes (toute la période, une provenance, un agent)
function figures(list) {
  const sales = list.filter(isSale);
  const revenue = sum(sales);
  return {
    orders: sales.length,
    revenue,
    avgBasket: sales.length ? Math.round(revenue / sales.length) : 0,
    payments: byMethod(sales),
    cancelled: amountOf(list.filter(isCancelled)),
    pending: amountOf(list.filter(isPending)),
  };
}

// Regroupe en gardant l'ordre d'arrivée des clés
function groupBy(list, keyOf) {
  const map = new Map();
  for (const o of list) {
    const k = keyOf(o);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  }
  return map;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'fr');

// `sources` : toutes les lignes OrderSource ({ id, name, kind, position, isActive }).
// Site d'abord, puis les provenances dans l'ordre du Patron ; une provenance désactivée n'apparaît que si
// elle a servi dans la période ; une provenance active sans commande apparaît avec des zéros.
export function salesBySource(orders, sources = []) {
  const groups = groupBy(orders, sourceKey);
  const rows = [{ key: SITE_KEY, name: SITE_LABEL, kind: 'SITE', isActive: true }];
  for (const s of [...sources].sort((a, b) => a.position - b.position)) {
    if (s.kind === 'SITE') continue;
    if (s.isActive || groups.has(s.id)) rows.push({ key: s.id, name: s.name, kind: s.kind, isActive: s.isActive });
  }
  for (const [key, list] of groups) {
    if (!rows.some((r) => r.key === key)) rows.push({ key, name: list[0].sourceName || 'Provenance supprimée', kind: null, isActive: false });
  }
  return rows.map((r) => ({ ...r, ...figures(groups.get(r.key) || []) }));
}

// Commandes saisies par chaque agent (lot 2). Les commandes du site n'ont pas d'agent.
export function salesByEnteredBy(orders) {
  const groups = groupBy(orders, (o) => (o.createdById || o.createdByName ? o.createdById || `nom:${o.createdByName}` : null));
  return [...groups].map(([key, list]) => ({
    key,
    name: list.at(-1).createdByName || 'Compte supprimé',
    role: list.at(-1).createdBy?.role || null,
    ...figures(list),
  })).sort(byName);
}

// Paiements vérifiés par chaque agent : commandes et montant (annulées ensuite à part), délai moyen de
// vérification (de l'arrivée de la commande au passage à « Payée »), aussi sur les commandes du site seules
// (une commande saisie par l'agent est souvent vérifiée aussitôt), et délai le plus long.
export function salesByVerifier(orders) {
  const verified = orders.map((o) => ({ o, v: verificationOf(o) })).filter((x) => x.v);
  const groups = groupBy(verified, (x) => x.v.key);
  return [...groups].map(([key, list]) => {
    const all = list.map((x) => x.o);
    const site = list.filter((x) => !x.o.createdById && !x.o.createdByName);
    const last = list.at(-1);
    return {
      key,
      name: last.v.name,
      role: last.o.statusChanges?.find((h) => h.toStatus === 'PAYEE')?.staffUser?.role || null,
      verified: all.length,
      ...figures(all),
      delay: {
        avgMinutes: avg(list.map((x) => x.v.minutes)),
        siteAvgMinutes: avg(site.map((x) => x.v.minutes)),
        siteCount: site.length,
        maxMinutes: list.length ? Math.max(...list.map((x) => x.v.minutes)) : null,
      },
    };
  }).sort(byName);
}

// Délai de vérification de toute l'équipe : toutes les commandes, celles du site seules, celles saisies par un agent
export function verificationDelays(orders) {
  const rows = orders.map((o) => ({ o, v: verificationOf(o) })).filter((x) => x.v);
  const fromAgent = (x) => Boolean(x.o.createdById || x.o.createdByName);
  return {
    count: rows.length,
    avgMinutes: avg(rows.map((x) => x.v.minutes)),
    siteCount: rows.filter((x) => !fromAgent(x)).length,
    siteAvgMinutes: avg(rows.filter((x) => !fromAgent(x)).map((x) => x.v.minutes)),
    agentCount: rows.filter(fromAgent).length,
    agentAvgMinutes: avg(rows.filter(fromAgent).map((x) => x.v.minutes)),
  };
}

// Frais de livraison du restaurant (mode Restaurant), payés au livreur : hors ventes, affichés à part.
// Jamais ceux de notre partenaire (feeCounted du tableau de bord les écarte).
export function restaurantFees(orders) {
  const fees = orders.filter(feeCounted);
  const part = (m) => fees.filter((o) => o.deliveryFeeMethod === m);
  const total = (list) => list.reduce((s, o) => s + o.deliveryFee, 0);
  return {
    count: fees.length,
    amount: total(fees),
    cash: { count: part('ESPECES').length, amount: total(part('ESPECES')) },
    mobile: { count: part('MOBILE_MONEY').length, amount: total(part('MOBILE_MONEY')) },
  };
}

const sourceName = (o, names) => names.get(sourceKey(o)) || o.sourceName || SITE_LABEL;

// Commandes annulées de la période, sans nom ni téléphone du client
export function cancellations(orders, names = new Map()) {
  return orders.filter(isCancelled).map((o) => {
    const c = cancellationOf(o);
    return {
      reference: o.reference,
      createdAt: o.createdAt,
      cancelledAt: c?.createdAt || null,
      stage: c?.fromStatus ? statusLabel(c.fromStatus, o.mode) : null,
      reason: c?.reason || null,
      by: c?.staffName || null,
      amount: o.itemsTotal,
      paymentMethod: METHOD_LABEL[o.paymentMethod] || o.paymentMethod,
      source: sourceName(o, names),
      enteredBy: o.createdByName || null,
      paymentWasVerified: Boolean(verificationOf(o)),
    };
  }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// Détail des commandes (feuille « Commandes » de l'Excel), sans nom ni téléphone du client
export function orderRows(orders, names = new Map()) {
  return [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((o) => {
    const v = verificationOf(o);
    return {
      reference: o.reference,
      createdAt: o.createdAt,
      counted: isSale(o) ? 'Vente' : isCancelled(o) ? 'Annulée' : 'Paiement à vérifier',
      status: statusLabel(o.status, o.mode),
      mode: MODE_LABEL[o.mode] || MODE_LABEL.LIVRAISON,
      source: sourceName(o, names),
      enteredBy: o.createdByName || null,
      verifiedBy: v?.name || null,
      verifiedAt: v?.at || null,
      verifyMinutes: v?.minutes ?? null,
      paymentMethod: METHOD_LABEL[o.paymentMethod] || o.paymentMethod,
      amount: o.itemsTotal,
    };
  });
}

// Ventes de la période. `period` : { from, to } (parsePeriod du relevé : dates libres, 366 jours au plus).
// `withOrders` : ajoute le détail des commandes (Excel seulement, pour garder la page légère).
export function buildSales(orders, sources, period, { now = new Date(), withOrders = false } = {}) {
  const inPeriod = orders.filter((o) => new Date(o.createdAt) >= period.from && new Date(o.createdAt) < new Date(period.to.getTime() + DAY));
  const bySource = salesBySource(inPeriod, sources);
  const names = new Map(bySource.map((s) => [s.key, s.name]));
  const all = figures(inPeriod);
  const sales = inPeriod.filter(isSale);
  return {
    period: { du: dayKey(period.from), au: dayKey(period.to), days: Math.round((period.to - period.from) / DAY) + 1 },
    generatedAt: now.toISOString(),
    summary: {
      received: inPeriod.length,
      orders: all.orders,
      revenue: all.revenue,
      avgBasket: all.avgBasket,
      cancelled: all.cancelled,
      pending: all.pending,
    },
    payments: all.payments,
    modes: ['LIVRAISON', 'A_EMPORTER'].map((mode) => ({ mode, label: MODE_LABEL[mode], ...amountOf(sales.filter((o) => (o.mode || 'LIVRAISON') === mode)) })),
    restaurantFees: restaurantFees(inPeriod),
    sources: bySource,
    enteredBy: salesByEnteredBy(inPeriod),
    verifiedBy: salesByVerifier(inPeriod),
    verification: verificationDelays(inPeriod),
    cancellations: cancellations(inPeriod, names),
    ...(withOrders ? { orders: orderRows(inPeriod, names) } : {}),
  };
}
