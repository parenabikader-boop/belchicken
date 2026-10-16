// Lot 5d : relevé de notre équipe de livraison par période, et conditions du contrat avec Belchicken
// (règles sans base de données, testées dans test/statement.test.js ; lectures dans statement.service.js).
//
// - Seules nos livraisons comptent : commandes en mode Prestataire (Order.deliveryOperator), à domicile.
// - Une livraison compte le jour où elle est livrée ; une annulation, le jour où elle est annulée.
// - Burkina Faso = heure UTC toute l'année : les jours se coupent à minuit UTC.
// - Jamais les ventes de Belchicken : ni plats, ni total des commandes, ni paiement des plats.
// - Conditions du contrat et montant dû : jamais pour le Responsable livraison (accord du client du
//   10 octobre 2026), ni dans la page, ni dans le PDF, ni dans l'Excel. forViewer() les retire.
import { z } from 'zod';
import { formatFcfa } from '../utils/format.js';

export const DAY = 24 * 60 * 60 * 1000;
export const PERIOD_MAX_DAYS = 366;
export const CONTRACT_KINDS = ['AUCUNE', 'PAR_LIVRAISON', 'FORFAIT_MENSUEL'];
export const KIND_LABEL = {
  AUCUNE: 'Rien à payer (essai)',
  PAR_LIVRAISON: 'Prix par livraison',
  FORFAIT_MENSUEL: 'Forfait mensuel',
};

// Champs que le Responsable livraison ne reçoit jamais
export const CONTRACT_FIELDS = ['contract', 'amountDue'];

// ─── Dates ───

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
export const startOfDay = (t) => {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
// '2026-10-01' -> minuit UTC, ou null si la date n'existe pas (31 février…)
export function parseDay(text) {
  if (typeof text !== 'string' || !DATE_RE.test(text)) return null;
  const d = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || dayKey(d) !== text ? null : d;
}
const daysInMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
const monthKey = (d) => dayKey(d).slice(0, 7);
const monthName = (d) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
// « 1er octobre », « 2 octobre »
const shortDay = (d) => `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(d)}`;
const plural = (n, word, many = `${word}s`) => `${n} ${n > 1 ? many : word}`;

// Période du relevé (dates libres, incluses) : du <= au <= aujourd'hui, 366 jours au plus.
// Renvoie { from, to, end } (end = lendemain de « au », exclu) ou { error }.
export function parsePeriod(du, au, now = new Date()) {
  const from = parseDay(du);
  const to = parseDay(au);
  if (!from || !to) return { error: 'Choisissez les deux dates de la période.' };
  if (to < from) return { error: 'La fin de la période est avant son début.' };
  if (to > startOfDay(now)) return { error: 'La période ne peut pas finir après aujourd’hui.' };
  if ((to - from) / DAY + 1 > PERIOD_MAX_DAYS) return { error: `Choisissez une période de ${PERIOD_MAX_DAYS} jours au plus.` };
  return { from, to, end: new Date(to.getTime() + DAY) };
}

// ─── Conditions du contrat ───

const price = (max) => z.coerce.number({ invalid_type_error: 'Indiquez un montant en F.' }).int('Montant en F, sans virgule.').min(0, 'Le montant ne peut pas être négatif.').max(max, 'Montant trop élevé.');

export const termsSchema = z.object({
  validFrom: z.string({ required_error: 'Choisissez la date d’effet.' }),
  kind: z.enum(CONTRACT_KINDS, { errorMap: () => ({ message: 'Choisissez la formule.' }) }),
  perDeliveryPrice: price(100000).nullable().optional(),
  monthlyFee: price(100000000).nullable().optional(),
  freeDeliveryPrice: price(100000).default(0),
  note: z.string().trim().max(200, 'Remarque trop longue (200 caractères au plus).').nullable().optional(),
});

// Nouvelle version : date d'effet aujourd'hui ou plus tard (un relevé déjà remis ne change jamais), montant
// de la formule obligatoire. Renvoie { data } prêt pour la base, ou { error }.
export function checkTerms(input, now = new Date()) {
  const validFrom = parseDay(input.validFrom);
  if (!validFrom) return { error: 'Choisissez la date d’effet.' };
  if (validFrom < startOfDay(now)) return { error: 'La date d’effet doit être aujourd’hui ou plus tard : un relevé déjà remis ne doit jamais changer.' };
  const data = {
    validFrom,
    kind: input.kind,
    perDeliveryPrice: null,
    monthlyFee: null,
    freeDeliveryPrice: input.freeDeliveryPrice ?? 0,
    note: input.note || null,
  };
  if (input.kind === 'PAR_LIVRAISON') {
    if (!(input.perDeliveryPrice > 0)) return { error: 'Indiquez le prix par livraison.' };
    data.perDeliveryPrice = input.perDeliveryPrice;
  }
  if (input.kind === 'FORFAIT_MENSUEL') {
    if (!(input.monthlyFee > 0)) return { error: 'Indiquez le montant du forfait mensuel.' };
    data.monthlyFee = input.monthlyFee;
  }
  return { data };
}

// Une version ne se supprime que si elle n'a pas encore commencé (date d'effet après aujourd'hui)
export const canDeleteTerms = (terms, now = new Date()) => new Date(terms.validFrom) > startOfDay(now);

// Version en vigueur un jour donné (versions triées ou non) : la dernière commencée, ou null
export function termsOn(day, versions) {
  let found = null;
  for (const v of versions) {
    if (new Date(v.validFrom) <= day && (!found || new Date(v.validFrom) > new Date(found.validFrom))) found = v;
  }
  return found;
}

// Phrase lisible d'une version : « Prix par livraison : 500 F · livraison offerte : 1 000 F »
export function termsText(v) {
  if (!v) return 'Conditions non réglées';
  const main = v.kind === 'PAR_LIVRAISON' ? `${KIND_LABEL.PAR_LIVRAISON} : ${formatFcfa(v.perDeliveryPrice)}`
    : v.kind === 'FORFAIT_MENSUEL' ? `${KIND_LABEL.FORFAIT_MENSUEL} : ${formatFcfa(v.monthlyFee)} par mois, au prorata des jours`
      : KIND_LABEL.AUCUNE;
  return v.freeDeliveryPrice > 0 ? `${main} · livraison offerte : ${formatFcfa(v.freeDeliveryPrice)} chacune` : main;
}

const publicTerms = (v, now) => ({
  id: v.id,
  validFrom: dayKey(v.validFrom),
  kind: v.kind,
  kindLabel: KIND_LABEL[v.kind],
  perDeliveryPrice: v.perDeliveryPrice,
  monthlyFee: v.monthlyFee,
  freeDeliveryPrice: v.freeDeliveryPrice,
  note: v.note,
  text: termsText(v),
  createdByName: v.createdByName,
  createdAt: v.createdAt,
  canDelete: canDeleteTerms(v, now),
});

// Page des conditions : toutes les versions (la plus récente d'abord) et celle en vigueur aujourd'hui
export function termsPage(versions, now = new Date()) {
  const current = termsOn(startOfDay(now), versions);
  return {
    current: current ? publicTerms(current, now) : null,
    versions: [...versions].sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom)).map((v) => publicTerms(v, now)),
  };
}

// ─── Montant dû par Belchicken ───

const EXPLAIN = {
  NON_REGLE: 'Aucune condition n’était réglée ces jours-là : rien n’est calculé.',
  AUCUNE: 'Période d’essai : Belchicken ne paie rien pour ces jours.',
  PAR_LIVRAISON: 'Belchicken paie un prix fixe pour chaque livraison faite par notre équipe.',
  FORFAIT_MENSUEL: 'Belchicken paie un forfait par mois. Pour un mois incomplet, il paie seulement les jours couverts : forfait × jours ÷ nombre de jours du mois.',
  OFFERTE: 'Le client n’a rien payé au livreur (livraison offerte) : Belchicken paie en plus un prix fixe pour chacune.',
};

// deliveriesByDay : Map 'AAAA-MM-JJ' -> { count, offered }. Une ligne par version et par mois, avec le calcul.
// Arrondi au franc près, une fois par ligne. incomplete = des jours sans conditions dans la période.
export function computeAmountDue({ from, end, versions, deliveriesByDay }) {
  const segments = [];
  for (let t = from.getTime(); t < end.getTime(); t += DAY) {
    const day = new Date(t);
    const v = termsOn(day, versions);
    const key = `${v?.id ?? '-'}|${monthKey(day)}`;
    const stats = deliveriesByDay.get(dayKey(day)) || { count: 0, offered: 0 };
    const last = segments[segments.length - 1];
    if (last && last.key === key) {
      last.to = day;
      last.days += 1;
      last.deliveries += stats.count;
      last.offered += stats.offered;
    } else {
      segments.push({ key, terms: v, from: day, to: day, days: 1, deliveries: stats.count, offered: stats.offered });
    }
  }

  const lines = [];
  for (const s of segments) {
    const period = s.days === 1 ? `le ${shortDay(s.from)}` : `du ${shortDay(s.from)} au ${shortDay(s.to)}`;
    const base = { from: dayKey(s.from), to: dayKey(s.to), days: s.days, versionId: s.terms?.id ?? null, period };
    const v = s.terms;
    if (!v) {
      lines.push({ ...base, kind: 'NON_REGLE', label: 'Conditions non réglées', detail: `${plural(s.deliveries, 'livraison')}, ${period}`, explain: EXPLAIN.NON_REGLE, amount: null });
      continue;
    }
    if (v.kind === 'AUCUNE') {
      lines.push({ ...base, kind: 'AUCUNE', label: KIND_LABEL.AUCUNE, detail: `${plural(s.deliveries, 'livraison')}, ${period}`, explain: EXPLAIN.AUCUNE, amount: 0 });
    } else if (v.kind === 'PAR_LIVRAISON') {
      lines.push({
        ...base, kind: 'PAR_LIVRAISON', label: KIND_LABEL.PAR_LIVRAISON,
        detail: `${plural(s.deliveries, 'livraison')} × ${formatFcfa(v.perDeliveryPrice)}, ${period}`,
        explain: EXPLAIN.PAR_LIVRAISON, quantity: s.deliveries, unitPrice: v.perDeliveryPrice, amount: s.deliveries * v.perDeliveryPrice,
      });
    } else {
      const dim = daysInMonth(s.from);
      lines.push({
        ...base, kind: 'FORFAIT_MENSUEL', label: `${KIND_LABEL.FORFAIT_MENSUEL} (${monthName(s.from)})`,
        detail: s.days === dim
          ? `${formatFcfa(v.monthlyFee)}, mois complet`
          : `${formatFcfa(v.monthlyFee)} × ${plural(s.days, 'jour')} ÷ ${dim} jours, ${period}`,
        explain: EXPLAIN.FORFAIT_MENSUEL, quantity: s.days, daysInMonth: dim, unitPrice: v.monthlyFee,
        amount: Math.round((v.monthlyFee * s.days) / dim),
      });
    }
    if (v.freeDeliveryPrice > 0 && s.offered > 0) {
      lines.push({
        ...base, kind: 'OFFERTE', label: 'Livraisons offertes',
        detail: `${plural(s.offered, 'livraison offerte', 'livraisons offertes')} × ${formatFcfa(v.freeDeliveryPrice)}, ${period}`,
        explain: EXPLAIN.OFFERTE, quantity: s.offered, unitPrice: v.freeDeliveryPrice, amount: s.offered * v.freeDeliveryPrice,
      });
    }
  }
  return {
    lines,
    total: lines.reduce((sum, l) => sum + (l.amount || 0), 0),
    incomplete: lines.some((l) => l.kind === 'NON_REGLE'),
  };
}

// ─── Livraisons, délais, livreurs, tournées, annulations ───

const lastAt = (list, test) => {
  let found = null;
  for (const x of list || []) if (test(x) && (!found || new Date(x.createdAt) >= new Date(found.createdAt))) found = x;
  return found;
};
const minutesBetween = (a, b) => (a && b && new Date(b) >= new Date(a) ? Math.round((new Date(b) - new Date(a)) / 60000) : null);

// Heures de chaque étape (preuves de 5c) : payée, prête, récupérée, livrée
export function timeline(o) {
  const changes = o.statusChanges || [];
  const pickup = lastAt(changes, (c) => c.toStatus === 'EN_LIVRAISON');
  return {
    paidAt: lastAt(changes, (c) => c.toStatus === 'PAYEE')?.createdAt ?? null,
    readyAt: lastAt(changes, (c) => c.toStatus === 'PRETE_LIVRAISON')?.createdAt ?? null,
    pickedUpAt: pickup?.createdAt ?? null,
    deliveredAt: lastAt(changes, (c) => c.toStatus === 'LIVREE')?.createdAt ?? null,
    cancelled: lastAt(changes, (c) => c.toStatus === 'ANNULEE'),
    pickedUpWithoutCourier: (o.events || []).some((e) => e.type === 'RECUPEREE_SANS_LIVREUR'),
  };
}

export const DELAYS = [
  { key: 'preparation', label: 'Préparation au restaurant', help: 'De « Payée » à « Prête pour livraison »', from: 'paidAt', to: 'readyAt' },
  { key: 'wait', label: 'Attente du livreur', help: 'De « Prête » à « Commande récupérée »', from: 'readyAt', to: 'pickedUpAt' },
  { key: 'ride', label: 'Trajet jusqu’au client', help: 'De « Commande récupérée » à « Livrée »', from: 'pickedUpAt', to: 'deliveredAt' },
  { key: 'total', label: 'Du paiement à la livraison', help: 'De « Payée » à « Livrée »', from: 'paidAt', to: 'deliveredAt' },
];

const average = (values) => {
  const list = values.filter((v) => v != null);
  return { minutes: list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null, count: list.length };
};

// Quartier choisi par le client, sinon « Position GPS » (jamais la position elle-même)
const zoneOf = (o) => o.deliveryZoneName || (o.latitude != null ? 'Position GPS' : null);

const STAGE_LABEL = {
  PAIEMENT_A_VERIFIER: 'Avant la vérification du paiement',
  PAYEE: 'Après le paiement, avant la préparation',
  EN_PREPARATION: 'Pendant la préparation',
  PRETE_LIVRAISON: 'Prête, en attente du livreur',
  EN_LIVRAISON: 'Pendant la livraison (livreur parti)',
};

// orders : commandes Prestataire à domicile, avec statusChanges et events (statement.service.js).
// runs : tournées Prestataire créées dans la période, avec leurs commandes.
// versions : conditions du contrat (vides et ignorées si withContract est faux).
// light (plan 1, call center allégé) : livraisons validées sans le code du client comptées à part (motif, par
// qui) ; sans lui, le relevé est exactement celui d'avant.
export function buildStatement({ period, orders, runs = [], versions = [], company = null, withContract, light = false, now = new Date() }) {
  const inPeriod = (t) => t && new Date(t) >= period.from && new Date(t) < period.end;

  const deliveries = [];
  const cancellations = [];
  for (const o of orders) {
    const tl = timeline(o);
    if (o.status === 'LIVREE' && inPeriod(tl.deliveredAt)) {
      const fee = o.deliveryFee ?? 0;
      const row = {
        reference: o.reference,
        deliveredAt: tl.deliveredAt,
        zone: zoneOf(o),
        courierId: o.courierId || null,
        courierName: o.courierName || '—',
        runId: o.deliveryRunId || null,
        fee,
        nightFee: o.deliveryNightFee || 0,
        offered: fee === 0,
        method: fee === 0 ? null : o.deliveryFeeMethod || null,
        cashRemitted: o.deliveryFeeMethod === 'ESPECES' ? Boolean(o.cashRemittanceId) : null,
        mobileVerified: o.deliveryFeeMethod === 'MOBILE_MONEY' ? Boolean(o.deliveryFeeVerifiedAt) : null,
        paidAt: tl.paidAt,
        readyAt: tl.readyAt,
        pickedUpAt: tl.pickedUpAt,
        pickedUpWithoutCourier: tl.pickedUpWithoutCourier,
      };
      if (light) {
        const done = lastAt(o.statusChanges || [], (c) => c.toStatus === 'LIVREE');
        row.withoutCode = Boolean(done?.reason);
        row.withoutCodeReason = done?.reason || null;
        row.withoutCodeBy = done?.reason ? done.staffName || null : null;
      }
      for (const d of DELAYS) row[`${d.key}Minutes`] = minutesBetween(tl[d.from], tl[d.to]);
      deliveries.push(row);
    } else if (o.status === 'ANNULEE' && tl.cancelled && inPeriod(tl.cancelled.createdAt)) {
      const stage = tl.cancelled.fromStatus;
      cancellations.push({
        reference: o.reference,
        cancelledAt: tl.cancelled.createdAt,
        stage,
        stageLabel: STAGE_LABEL[stage] || 'Autre étape',
        afterPickup: stage === 'EN_LIVRAISON',
        reason: tl.cancelled.reason || null,
        by: tl.cancelled.staffName || null,
        courierName: o.courierName || null,
        zone: zoneOf(o),
      });
    }
  }
  deliveries.sort((a, b) => new Date(a.deliveredAt) - new Date(b.deliveredAt));
  cancellations.sort((a, b) => new Date(a.cancelledAt) - new Date(b.cancelledAt));

  // Frais encaissés (notre argent : nos codes marchands, ou espèces de nos livreurs)
  const sum = (list) => list.reduce((s, d) => s + d.fee, 0);
  const cash = deliveries.filter((d) => d.method === 'ESPECES');
  const mobile = deliveries.filter((d) => d.method === 'MOBILE_MONEY');
  const unknown = deliveries.filter((d) => !d.offered && !d.method);
  const fees = {
    total: sum(deliveries),
    nightTotal: deliveries.reduce((s, d) => s + d.nightFee, 0),
    cash: { count: cash.length, amount: sum(cash), remitted: sum(cash.filter((d) => d.cashRemitted)), held: sum(cash.filter((d) => !d.cashRemitted)) },
    mobile: { count: mobile.length, amount: sum(mobile), verified: sum(mobile.filter((d) => d.mobileVerified)), toVerify: sum(mobile.filter((d) => !d.mobileVerified)) },
    unknown: { count: unknown.length, amount: sum(unknown) },
    offeredCount: deliveries.filter((d) => d.offered).length,
  };

  const delays = DELAYS.map((d) => ({ key: d.key, label: d.label, help: d.help, ...average(deliveries.map((x) => x[`${d.key}Minutes`])) }));

  // Par livreur (le dernier livreur de chaque commande)
  const byCourier = new Map();
  for (const d of deliveries) {
    const key = d.courierId || `nom:${d.courierName}`;
    if (!byCourier.has(key)) byCourier.set(key, { courierId: d.courierId, name: d.courierName, list: [] });
    byCourier.get(key).list.push(d);
  }
  const couriers = [...byCourier.values()].map(({ courierId, name, list }) => ({
    courierId,
    name,
    deliveries: list.length,
    offered: list.filter((d) => d.offered).length,
    cash: sum(list.filter((d) => d.method === 'ESPECES')),
    cashHeld: sum(list.filter((d) => d.method === 'ESPECES' && !d.cashRemitted)),
    mobile: sum(list.filter((d) => d.method === 'MOBILE_MONEY')),
    rideMinutes: average(list.map((d) => d.rideMinutes)).minutes,
    waitMinutes: average(list.map((d) => d.waitMinutes)).minutes,
    pickedUpWithoutCourier: list.filter((d) => d.pickedUpWithoutCourier).length,
    runs: new Set(list.map((d) => d.runId).filter(Boolean)).size,
    ...(light && { withoutCode: list.filter((d) => d.withoutCode).length }),
  })).sort((a, b) => b.deliveries - a.deliveries || a.name.localeCompare(b.name, 'fr'));

  // Par tournée : de la première récupération à la dernière livraison
  const tours = runs.map((r) => {
    const tls = (r.orders || []).map((o) => ({ status: o.status, ...timeline(o) }));
    const pickups = tls.map((t) => t.pickedUpAt).filter(Boolean).map((t) => new Date(t));
    const delivered = tls.filter((t) => t.status === 'LIVREE' && t.deliveredAt).map((t) => new Date(t.deliveredAt));
    const first = pickups.length ? new Date(Math.min(...pickups)) : null;
    const last = delivered.length ? new Date(Math.max(...delivered)) : null;
    return {
      id: r.id,
      createdAt: r.createdAt,
      courierName: r.courierName,
      createdByName: r.createdByName,
      orders: tls.length,
      delivered: tls.filter((t) => t.status === 'LIVREE').length,
      cancelled: tls.filter((t) => t.status === 'ANNULEE').length,
      firstPickupAt: first,
      lastDeliveredAt: last,
      durationMinutes: minutesBetween(first, last),
    };
  }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Par jour (pour l'Excel et le montant dû)
  const byDay = new Map();
  for (const d of deliveries) {
    const key = dayKey(d.deliveredAt);
    const s = byDay.get(key) || { count: 0, offered: 0, fees: 0 };
    s.count += 1;
    s.offered += d.offered ? 1 : 0;
    s.fees += d.fee;
    byDay.set(key, s);
  }

  const statement = {
    period: { du: dayKey(period.from), au: dayKey(period.to), days: Math.round((period.end - period.from) / DAY) },
    company: { name: company?.companyName || null, client: 'Belchicken Burkina' },
    generatedAt: now,
    summary: {
      deliveries: deliveries.length,
      offered: fees.offeredCount,
      cancellations: cancellations.length,
      feesTotal: fees.total,
      cash: fees.cash.amount,
      mobile: fees.mobile.amount,
      couriers: couriers.length,
      tours: tours.length,
      ...(light && { withoutCode: deliveries.filter((d) => d.withoutCode).length }),
    },
    fees,
    delays,
    couriers,
    tours,
    cancellations,
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, s]) => ({ day, ...s })),
    deliveries,
  };

  if (withContract) {
    const due = computeAmountDue({ from: period.from, end: period.end, versions, deliveriesByDay: byDay });
    const used = new Set(due.lines.map((l) => l.versionId).filter(Boolean));
    statement.contract = {
      versions: versions.filter((v) => used.has(v.id)).sort((a, b) => new Date(a.validFrom) - new Date(b.validFrom)).map((v) => publicTerms(v, now)),
    };
    statement.amountDue = due;
  }
  return forViewer(statement, withContract);
}

// Le Responsable livraison ne reçoit jamais les conditions du contrat ni le montant dû
export function forViewer(statement, withContract) {
  if (withContract) return statement;
  const out = { ...statement };
  for (const key of CONTRACT_FIELDS) delete out[key];
  return out;
}

// Seul le Responsable livraison est privé des conditions (Prestataire : tout ; Patron : tout, si RELEVE est ouvert)
export const seesContract = (role) => role !== 'RESPONSABLE_LIVRAISON';
