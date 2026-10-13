// Tableau de bord, bloc « Aujourd'hui » (nouvelle présentation, liée au réglage « Nouvelle page Commandes et
// barre ⋮ ») : calculs sans base de données, testés dans test/today.test.js. Lectures dans dashboard.service.js
// (getToday). Le bloc « Maintenant » (retards, paiements à vérifier, messages) n'est pas calculé ici : le site le
// tire de la liste des commandes déjà rechargée par l'espace équipe, avec les mêmes règles que la page Commandes.
//
// Mêmes règles que le tableau de bord (dashboard.js) : chiffre = plats des commandes payées et au-delà, frais
// comptés une fois payés au livreur, jamais ceux de notre partenaire. Heure du Burkina = UTC.
import { summarize } from './dashboard.js';
import { salesBySource } from './sales.js';

const DAY = 24 * 3600 * 1000;
const startOfDay = (t) => Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
export const TOP_SIZE = 5;
export const TOP_DAYS = 7; // « 7 jours » = aujourd'hui et les 6 jours d'avant

// Aujourd'hui jusqu'à maintenant, hier jusqu'à la même heure, le même jour de la semaine dernière jusqu'à la
// même heure, et le début des 7 derniers jours (plats les plus vendus)
export function todayRanges(now = new Date()) {
  const start = startOfDay(now);
  const elapsed = now.getTime() - start;
  const at = (s) => ({ start: new Date(s), end: new Date(s + elapsed) });
  return {
    today: at(start),
    yesterday: at(start - DAY),
    lastWeek: at(start - 7 * DAY),
    weekStart: new Date(start - (TOP_DAYS - 1) * DAY),
    now,
  };
}

const inRange = (o, r) => o.createdAt >= r.start && o.createdAt < r.end;

// Chiffres d'une journée : seulement ce que le bloc affiche (le détail reste dans l'analyse détaillée)
function figures(orders) {
  const s = summarize(orders);
  return { revenue: s.revenue, paid: s.paid, avgBasket: s.avgBasket, deliveryRevenue: s.deliveryRevenue, deliveryPaid: s.deliveryPaid };
}

// Plats les plus vendus, à partir des lignes regroupées par la base ({ productId, productName, _sum }) :
// un plat renommé garde une seule ligne (son nom le plus vendu), comme le tableau de bord (par productId)
export function topProducts(groups, size = TOP_SIZE) {
  const map = new Map();
  for (const g of groups) {
    const id = g.productId || `nom:${g.productName}`;
    const quantity = g._sum?.quantity || 0;
    const cur = map.get(id) || { name: g.productName, quantity: 0, revenue: 0, best: 0 };
    if (quantity > cur.best) {
      cur.name = g.productName;
      cur.best = quantity;
    }
    cur.quantity += quantity;
    cur.revenue += g._sum?.lineTotal || 0;
    map.set(id, cur);
  }
  return [...map.values()]
    .filter((p) => p.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name, 'fr'))
    .slice(0, size)
    .map(({ name, quantity, revenue }) => ({ name, quantity, revenue }));
}

// Provenance du jour (règles de la page Ventes) : seulement les provenances qui ont des ventes ; liste vide
// s'il n'y a que « Site » (cas de la production tant que la prise de commande par l'agent est éteinte)
export function todaySources(orders, sources) {
  const kindOf = new Map(sources.map((s) => [s.id, s.kind]));
  const withKind = orders.map((o) => ({ ...o, source: o.sourceId ? { kind: kindOf.get(o.sourceId) ?? null } : null }));
  const rows = salesBySource(withKind, sources)
    .filter((r) => r.orders > 0)
    .map((r) => ({ name: r.name, kind: r.kind, orders: r.orders, revenue: r.revenue }));
  return rows.length === 1 && rows[0].kind === 'SITE' ? [] : rows;
}

// orders : commandes des 3 tranches (aujourd'hui, hier et la semaine dernière, jusqu'à la même heure)
export function buildToday({ orders, sources = [], topToday = [], topWeek = [], ranges }) {
  return {
    at: ranges.now,
    today: figures(orders.filter((o) => inRange(o, ranges.today))),
    yesterday: figures(orders.filter((o) => inRange(o, ranges.yesterday))),
    lastWeek: figures(orders.filter((o) => inRange(o, ranges.lastWeek))),
    lastWeekDay: ranges.lastWeek.start,
    topToday: topProducts(topToday),
    topWeek: topProducts(topWeek),
    sources: todaySources(orders.filter((o) => inRange(o, ranges.today)), sources),
  };
}
