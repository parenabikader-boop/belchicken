// Compte Patron simplifié (interrupteur COMPTE_PATRON_SIMPLE, fermé par défaut) : page « Comptes » du Patron.
// Calculs sans base de données, testés dans test/compte-patron.test.js ; lectures dans patron-accounts.service.js.
//
// Règles (contrôle des chiffres du 17 octobre 2026) :
// - Ventes = plats des commandes payées et au-delà (PAID du tableau de bord), le jour où la commande a été passée.
//   Jamais les frais de livraison : ceux de notre équipe (mode Prestataire) ne sont pas à Belchicken et
//   n'apparaissent nulle part ici ; ceux des livreurs du restaurant (mode Restaurant) sont montrés à part, hors ventes.
// - Annulées : jamais dans les ventes, séparées en « après paiement » (argent reçu : à rembourser) et « avant
//   paiement » (le client n'a jamais payé).
// - Payées automatiquement (SMS, Ligdicash) et saisies par un agent : comptées comme les autres ventes ; le mode de
//   validation est montré dans la liste des transactions.
// - Commandes d'essai : celles passées avant la date COMPTES_PATRON_DEPUIS (réglage Render, vide = toutes) ne
//   comptent pas, ni dans la période ni dans la comparaison.
// - Jamais le nom du client ; son numéro (celui qui a payé) masqué en partie ; carte en zones regroupées.
// Heure du Burkina = UTC toute l'année.
import { PAID, periodRange } from './dashboard.js';
import { verificationOf } from './sales.js';
import { topProducts } from './today.js';
import { AUTO_NAME } from './payment-sms.js';
import { PAYMENT_LABELS } from '../utils/format.js';
import { DAY, dayKey, parsePeriod } from './statement.js';

export const KINDS = ['jour', 'semaine', 'mois', 'dates'];
const KIND_TO_PERIOD = { jour: 'day', semaine: 'week', mois: 'month' };
export const TOP_DISHES = 5;
// Seuils des phrases : en dessous, rien n'est dit (trop peu de données pour conclure)
export const MIN_SALES_HOUR = 10; // « Votre meilleure heure »
export const MIN_SALES_WEEKDAY = 20; // « Le mardi est votre jour le plus calme », sur 14 jours au moins
export const MIN_DAYS_WEEKDAY = 14;
export const MIN_SALES_TREND = 5; // « Ventes en hausse de 12 % » : 5 ventes au moins dans chaque période
export const MIN_DISH = 5; // « Plat le plus vendu »
export const STABLE_PCT = 3; // entre −3 % et +3 % : « stables »
// Carte : cases d'environ 1 km ; une case de moins de MIN_ZONE commandes n'est jamais montrée (on ne doit pas pouvoir
// retrouver un client), elle est comptée dans « autres quartiers »
export const ZONE_DEG = 0.009;
export const MIN_ZONE = 3;

export const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const isSale = (o) => PAID.includes(o.status);
const isCancelled = (o) => o.status === 'ANNULEE';
const sum = (list) => list.reduce((s, o) => s + o.itemsTotal, 0);
const startOfDay = (t) => Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
const weekdayOf = (t) => (t.getUTCDay() + 6) % 7; // lundi = 0

// Période choisie et période de comparaison (même durée, juste avant). Période en cours : comparée au même moment de
// la précédente (aujourd'hui jusqu'à 14 h contre hier jusqu'à 14 h). Renvoie { error } si les dates sont fausses.
export function accountsRange({ periode = 'jour', du, au } = {}, now = new Date()) {
  if (!KINDS.includes(periode)) return { error: 'Période inconnue.' };
  if (periode !== 'dates') {
    const r = periodRange(KIND_TO_PERIOD[periode], 0, now);
    return { kind: periode, start: r.start, end: r.end, cutoff: r.cutoff, prevStart: r.prevStart, compareEnd: r.compareEnd, isCurrent: true };
  }
  const p = parsePeriod(du, au, now);
  if (p.error) return { error: p.error };
  const cutoff = new Date(Math.min(p.end.getTime(), now.getTime()));
  const length = p.end - p.from;
  const prevStart = new Date(p.from.getTime() - length);
  return {
    kind: 'dates', start: p.from, end: p.end, cutoff, prevStart,
    compareEnd: new Date(prevStart.getTime() + (cutoff - p.from)), isCurrent: cutoff < p.end,
  };
}

// « 70 •• •• 56 » : seulement les 2 premiers et les 2 derniers chiffres du numéro (8 derniers chiffres)
export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-8);
  if (digits.length < 8) return null;
  return `${digits.slice(0, 2)} •• •• ${digits.slice(6)}`;
}

// Validée automatiquement : premier passage à « Payée » noté « Paiement automatique », sans membre de l'équipe
export const isAutoPaid = (o) => {
  const paid = (o.statusChanges || []).find((h) => h.toStatus === 'PAYEE');
  return Boolean(paid && !paid.staffUserId && paid.staffName === AUTO_NAME);
};

// Argent reçu : ventes, et commandes annulées après la vérification du paiement
const moneyReceived = (o) => isSale(o) || (isCancelled(o) && verificationOf(o));

function figures(list) {
  const sales = list.filter(isSale);
  const revenue = sum(sales);
  const cancelled = list.filter(isCancelled);
  const afterPayment = cancelled.filter((o) => verificationOf(o));
  const delivery = sales.filter((o) => (o.mode || 'LIVRAISON') === 'LIVRAISON');
  const pickup = sales.filter((o) => o.mode === 'A_EMPORTER');
  return {
    revenue,
    paid: sales.length,
    avgBasket: sales.length ? Math.round(revenue / sales.length) : 0,
    delivery: { count: delivery.length, revenue: sum(delivery) },
    pickup: { count: pickup.length, revenue: sum(pickup) },
    cancelled: {
      count: cancelled.length,
      afterPayment: { count: afterPayment.length, amount: sum(afterPayment) },
      beforePayment: cancelled.length - afterPayment.length,
    },
    pending: list.filter((o) => o.status === 'PAIEMENT_A_VERIFIER').length,
    autoPaid: sales.filter(isAutoPaid).length,
  };
}

// Évolution en % (arrondie), null sans base de comparaison
export const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

// Frais de livraison des livreurs du restaurant (mode Restaurant) : à Belchicken, mais hors ventes. Jamais ceux de notre
// équipe (mode Prestataire) ni des livreurs indépendants.
function restaurantFees(list) {
  const fees = list.filter((o) => o.deliveryOperator === 'RESTAURANT' && o.deliveryFee != null && o.deliveryFeeMethod != null && o.status !== 'ANNULEE');
  return { count: fees.length, amount: fees.reduce((s, o) => s + o.deliveryFee, 0) };
}

// Toutes les transactions (argent reçu), la plus récente d'abord : heure de la vérification du paiement, référence,
// montant des plats, opérateur, validation automatique ou à la main (par qui), numéro masqué. Jamais le nom du client.
export function transactions(list) {
  return list.filter(moneyReceived).map((o) => {
    const v = verificationOf(o);
    const auto = isAutoPaid(o);
    return {
      at: v?.at || o.createdAt,
      reference: o.reference,
      amount: o.itemsTotal,
      method: PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod,
      auto,
      by: auto ? null : v?.name || null,
      phone: maskPhone(o.paymentPayerPhone),
      mode: o.mode === 'A_EMPORTER' ? 'À récupérer' : 'Livraison',
      cancelled: isCancelled(o),
    };
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
}

// Nombre de lundis, mardis… dans la période (jusqu'à maintenant), pour comparer les jours entre eux
export function weekdayOccurrences(start, cutoff) {
  const out = Array(7).fill(0);
  for (let t = startOfDay(start); t < cutoff.getTime(); t += DAY) out[weekdayOf(new Date(t))] += 1;
  return out;
}

// Ventes par heure et par jour de la semaine (commandes payées) ; pour les jours, aussi la moyenne par jour ouvert
export function rhythm(sales, range) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }));
  const days = WEEKDAY_NAMES.map((name, i) => ({ day: i, name, count: 0, revenue: 0, occurrences: 0, avgRevenue: 0 }));
  for (const o of sales) {
    const t = new Date(o.createdAt);
    hours[t.getUTCHours()].count += 1;
    hours[t.getUTCHours()].revenue += o.itemsTotal;
    days[weekdayOf(t)].count += 1;
    days[weekdayOf(t)].revenue += o.itemsTotal;
  }
  const occ = weekdayOccurrences(range.start, range.cutoff);
  for (const d of days) {
    d.occurrences = occ[d.day];
    d.avgRevenue = d.occurrences ? Math.round(d.revenue / d.occurrences) : 0;
  }
  return { hours, days };
}

// Plats les plus vendus (quantités des commandes payées) : mêmes règles que le tableau de bord d'un coup d'œil
export function topDishes(sales, size = TOP_DISHES) {
  const groups = sales.flatMap((o) => o.items || []).map((i) => ({
    productId: i.productId, productName: i.productName, _sum: { quantity: i.quantity, lineTotal: i.lineTotal },
  }));
  return topProducts(groups, size);
}

// Carte des clients : commandes livrées (à domicile) avec une position, regroupées par case d'environ 1 km. Seules
// les cases d'au moins MIN_ZONE commandes sont montrées, au centre de la case (jamais la position d'un client).
export function clientZones(list, { size = ZONE_DEG, min = MIN_ZONE } = {}) {
  const cells = new Map();
  let total = 0;
  for (const o of list) {
    if (o.status !== 'LIVREE' || o.mode === 'A_EMPORTER' || o.latitude == null || o.longitude == null) continue;
    total += 1;
    const key = `${Math.floor(o.latitude / size)}:${Math.floor(o.longitude / size)}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  const round = (v) => Math.round(v * 10000) / 10000;
  const zones = [...cells]
    .filter(([, count]) => count >= min)
    .map(([key, count]) => {
      const [y, x] = key.split(':').map(Number);
      return { lat: round((y + 0.5) * size), lng: round((x + 0.5) * size), count };
    })
    .sort((a, b) => b.count - a.count);
  const shown = zones.reduce((s, z) => s + z.count, 0);
  return { total, zones, hidden: total - shown, sizeKm: 1 };
}

const hourText = (h) => `${h} h – ${(h + 1) % 24} h`;
const COMPARED = {
  jour: (current) => (current ? 'à hier à la même heure' : 'à la veille'),
  semaine: (current) => (current ? 'à la semaine dernière au même moment' : 'à la semaine d’avant'),
  mois: (current) => (current ? 'au mois dernier au même moment' : 'au mois d’avant'),
  dates: () => 'à la période d’avant',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Phrases calculées par le serveur, seulement quand il y a assez de données. { key, text, tone } ; tone : good, bad, info.
export function insights({ summary, previous, rhythm: r, top, range }) {
  const out = [];
  if (summary.paid >= MIN_SALES_TREND && previous.paid >= MIN_SALES_TREND) {
    const p = pct(summary.revenue, previous.revenue);
    const vs = `par rapport ${COMPARED[range.kind](range.isCurrent)}`;
    if (p != null && Math.abs(p) < STABLE_PCT) out.push({ key: 'tendance', tone: 'info', text: `Ventes stables ${vs}` });
    else if (p != null) out.push({ key: 'tendance', tone: p > 0 ? 'good' : 'bad', text: `Ventes en ${p > 0 ? 'hausse' : 'baisse'} de ${Math.abs(p)} % ${vs}` });
  }
  if (summary.paid >= MIN_SALES_HOUR) {
    const best = [...r.hours].sort((a, b) => b.count - a.count || b.revenue - a.revenue)[0];
    out.push({ key: 'heure', tone: 'info', text: `Votre meilleure heure : ${hourText(best.hour)}` });
  }
  const days = r.days.filter((d) => d.occurrences > 0);
  const covered = r.days.reduce((s, d) => s + d.occurrences, 0);
  if (summary.paid >= MIN_SALES_WEEKDAY && covered >= MIN_DAYS_WEEKDAY && days.length === 7) {
    const sorted = [...days].sort((a, b) => b.avgRevenue - a.avgRevenue);
    const best = sorted[0];
    const calm = sorted.at(-1);
    if (best.avgRevenue > calm.avgRevenue) {
      out.push({ key: 'meilleur-jour', tone: 'good', text: `${cap(`le ${best.name}`)} est votre meilleur jour` });
      out.push({ key: 'jour-calme', tone: 'info', text: `${cap(`le ${calm.name}`)} est votre jour le plus calme` });
    }
  }
  if (top[0] && top[0].quantity >= MIN_DISH) out.push({ key: 'plat', tone: 'good', text: `Plat le plus vendu : ${top[0].name} (${top[0].quantity} vendus)` });
  if (summary.paid >= MIN_SALES_HOUR && summary.pickup.count > 0) {
    const share = Math.round((summary.pickup.count / summary.paid) * 100);
    out.push({ key: 'recuperer', tone: 'info', text: `${share} % des commandes sont à récupérer au restaurant` });
  }
  return out;
}

// Commandes d'essai : celles d'avant la date de début des comptes (COMPTES_PATRON_DEPUIS) ne comptent pas
export const countedFrom = (since) => (o) => !since || new Date(o.createdAt) >= since;

// Page « Comptes ». orders : commandes de la période et de la période de comparaison.
export function buildAccounts(orders, range, { since = null, now = new Date() } = {}) {
  const counted = orders.filter(countedFrom(since));
  const inRange = (from, to) => (o) => new Date(o.createdAt) >= from && new Date(o.createdAt) < to;
  const current = counted.filter(inRange(range.start, range.cutoff));
  const before = counted.filter(inRange(range.prevStart, range.compareEnd));
  const summary = figures(current);
  const previous = figures(before);
  const sales = current.filter(isSale);
  const r = rhythm(sales, range);
  const top = topDishes(sales);
  return {
    period: {
      kind: range.kind, du: dayKey(range.start), au: dayKey(new Date(range.end.getTime() - DAY)),
      cutoff: range.cutoff, isCurrent: range.isCurrent, compared: COMPARED[range.kind](range.isCurrent),
    },
    generatedAt: now.toISOString(),
    since: since ? dayKey(since) : null,
    summary,
    previous,
    changes: {
      revenue: pct(summary.revenue, previous.revenue),
      paid: pct(summary.paid, previous.paid),
      avgBasket: pct(summary.avgBasket, previous.avgBasket),
      cancelled: pct(summary.cancelled.count, previous.cancelled.count),
    },
    // Trop tôt pour comparer : moins de 5 ventes dans la période d'avant au même moment
    comparable: previous.paid >= MIN_SALES_TREND,
    restaurantFees: restaurantFees(current),
    insights: insights({ summary, previous, rhythm: r, top, range }),
    hours: r.hours,
    days: r.days,
    top,
    zones: clientZones(current),
    transactions: transactions(current),
  };
}
