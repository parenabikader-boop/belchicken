// Compte Patron simplifié (interrupteur COMPTE_PATRON_SIMPLE, fermé par défaut) : contrôle des chiffres du tableau de
// bord actuel (étape 1, ce que chaque chiffre compte et ne compte pas), puis la page Comptes, les phrases, la carte,
// les résumés et les alertes (lot A).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, periodRange, summarize } from '../src/services/dashboard.js';
import { buildToday, todayRanges } from '../src/services/today.js';
import { buildSales } from '../src/services/sales.js';
import {
  accountsRange, buildAccounts, clientZones, insights, isAutoPaid, maskPhone, MIN_ZONE, rhythm, transactions, weekdayOccurrences,
} from '../src/services/patron-accounts.js';
import {
  DEFAULT_SETTINGS, digestNotification, digestSettingsSchema, dueDigests, eveningDay, lowReviewForPatron, outageNotification, outageUpdate,
} from '../src/services/patron-digest.js';
import { featureMap, FEATURES } from '../src/services/features.js';
import { teamRoles } from '../src/services/push.service.js';
import { staffRouter } from '../src/routes/staff.routes.js';
import { accessFor } from '../src/middlewares/staff-auth.js';

// Samedi 17 octobre 2026, 21 h 30 (heure du Burkina = UTC)
const NOW = new Date('2026-10-17T21:30:00Z');
let n = 0;
const paidBy = (name, at, staffUserId = 'agent-1') => ({ toStatus: 'PAYEE', fromStatus: 'PAIEMENT_A_VERIFIER', staffUserId, staffName: name, createdAt: new Date(at) });
const auto = (at) => paidBy('Paiement automatique', at, null);
const cancel = (at) => ({ toStatus: 'ANNULEE', fromStatus: 'PAYEE', staffUserId: 'agent-1', staffName: 'Awa', createdAt: new Date(at), reason: 'Client injoignable' });
function order(createdAt, status, total, extra = {}) {
  n += 1;
  return {
    reference: `BC-T${n}`,
    createdAt: new Date(createdAt),
    status,
    mode: 'LIVRAISON',
    paymentMethod: 'ORANGE_MONEY',
    paymentPayerPhone: '+22670123456',
    itemsTotal: total,
    deliveryFee: null,
    deliveryFeeMethod: null,
    deliveryOperator: 'RESTAURANT',
    sourceId: null,
    sourceName: null,
    createdById: null,
    createdByName: null,
    latitude: null,
    longitude: null,
    items: [],
    statusChanges: PAID_STATUSES.includes(status) ? [paidBy('Awa', createdAt)] : [],
    ...extra,
  };
}
const PAID_STATUSES = ['PAYEE', 'EN_PREPARATION', 'PRETE_LIVRAISON', 'EN_LIVRAISON', 'PRETE', 'LIVREE'];

// ─── Étape 1 : contrôle des chiffres du tableau de bord actuel (rien n'y change) ───

test('contrôle : le chiffre d’affaires ne compte que les plats des commandes payées (ni annulées, ni à vérifier)', () => {
  const s = summarize([
    order(NOW, 'LIVREE', 10000),
    order(NOW, 'ANNULEE', 7000, { statusChanges: [paidBy('Awa', NOW), cancel(NOW)] }), // payée puis annulée
    order(NOW, 'ANNULEE', 3000), // jamais payée
    order(NOW, 'PAIEMENT_A_VERIFIER', 5000),
  ]);
  assert.equal(s.revenue, 10000);
  assert.equal(s.paid, 1);
  assert.equal(s.cancelled, 2); // payées puis annulées et jamais payées, mélangées
  assert.equal(s.toVerify, 1);
  assert.equal(s.received, 4);
});

test('contrôle : les frais de livraison ne sont jamais dans le chiffre des plats ; ceux de notre équipe jamais dans les frais du restaurant', () => {
  const s = summarize([
    order(NOW, 'LIVREE', 10000, { deliveryFee: 1000, deliveryFeeMethod: 'ESPECES' }),
    order(NOW, 'LIVREE', 8000, { deliveryFee: 1500, deliveryFeeMethod: 'MOBILE_MONEY', deliveryOperator: 'PRESTATAIRE' }),
  ]);
  assert.equal(s.revenue, 18000);
  assert.equal(s.deliveryRevenue, 1000); // seulement le restaurant
  assert.equal(s.partnerFees, 1500); // les nôtres, montrées à part au Patron
});

test('contrôle : une commande payée automatiquement (SMS) ou saisie par un agent compte comme les autres', () => {
  const s = summarize([
    order(NOW, 'PAYEE', 6000, { statusChanges: [auto(NOW)] }),
    order(NOW, 'EN_PREPARATION', 4000, { createdById: 'agent-2', createdByName: 'Awa', sourceName: 'Appel' }),
  ]);
  assert.equal(s.revenue, 10000);
  assert.equal(s.paid, 2);
});

test('contrôle : aucune commande d’essai n’est écartée par le tableau de bord actuel (tout compte, essais compris)', () => {
  const essai = order('2026-10-17T12:00:00Z', 'LIVREE', 2500, { customerName: 'Test (essai)' });
  assert.equal(summarize([essai]).revenue, 2500);
  const t = buildToday({ orders: [essai], ranges: todayRanges(NOW) });
  assert.equal(t.today.revenue, 2500);
});

test('contrôle : les heures de pointe comptent la demande (commandes reçues, même pas encore payées), sans les annulées', () => {
  const d = buildDashboard([
    order('2026-10-17T20:10:00Z', 'PAIEMENT_A_VERIFIER', 5000),
    order('2026-10-17T20:20:00Z', 'ANNULEE', 5000),
    order('2026-10-17T19:10:00Z', 'LIVREE', 5000),
  ], periodRange('day', 0, NOW));
  assert.equal(d.hours[20], 1);
  assert.equal(d.hours[19], 1);
});

test('contrôle : une commande compte le jour où elle a été passée, même payée après minuit', () => {
  const late = order('2026-10-16T23:55:00Z', 'LIVREE', 9000, { statusChanges: [paidBy('Awa', '2026-10-17T00:05:00Z')] });
  assert.equal(buildDashboard([late], periodRange('day', 0, NOW)).summary.revenue, 0);
  assert.equal(buildDashboard([late], periodRange('day', -1, NOW)).summary.revenue, 9000);
});

test('contrôle : la page Ventes suit les mêmes règles (annulées et frais à part, payées auto comptées)', () => {
  const s = buildSales([
    order('2026-10-17T10:00:00Z', 'LIVREE', 10000, { deliveryFee: 1000, deliveryFeeMethod: 'ESPECES' }),
    order('2026-10-17T11:00:00Z', 'PAYEE', 6000, { statusChanges: [auto('2026-10-17T11:01:00Z')] }),
    order('2026-10-17T12:00:00Z', 'ANNULEE', 3000),
  ], [], { from: new Date('2026-10-17T00:00:00Z'), to: new Date('2026-10-17T00:00:00Z') }, { now: NOW });
  assert.equal(s.summary.revenue, 16000);
  assert.equal(s.summary.cancelled.count, 1);
  assert.equal(s.restaurantFees.amount, 1000);
  assert.ok(s.verifiedBy.some((v) => v.name === 'Paiement automatique'));
});

// ─── Interrupteur ───

test('interrupteur « Compte Patron simplifié » : fermé sans ligne, ouvert seulement par le Prestataire', () => {
  assert.ok(FEATURES.some((f) => f.key === 'COMPTE_PATRON_SIMPLE'));
  assert.equal(featureMap([]).COMPTE_PATRON_SIMPLE, false);
  assert.equal(featureMap([{ key: 'COMPTE_PATRON_SIMPLE', enabled: true }]).COMPTE_PATRON_SIMPLE, true);
});

test('alertes de commande : le Patron les reçoit comme avant, plus du tout avec le compte simplifié', () => {
  assert.deepEqual(teamRoles(false), ['PATRON', 'OPERATEUR']);
  assert.deepEqual(teamRoles(true), ['OPERATEUR']);
});

test('adresses /comptes : Patron et Prestataire seulement, derrière l’interrupteur', () => {
  const layer = staffRouter.stack.find((l) => l.handle?.stack && /comptes/.test(l.regexp.source));
  assert.ok(layer, 'adresse /comptes introuvable');
  const guards = layer.handle.stack.filter((l) => l.handle.staffAccess).map((l) => l.handle.staffAccess);
  const features = layer.handle.stack.filter((l) => l.handle.staffFeature).map((l) => l.handle.staffFeature);
  assert.deepEqual(features, ['COMPTE_PATRON_SIMPLE']);
  const ok = (role) => guards.every((g) => accessFor({ id: 'u', role, mustChangePassword: false }, g.roles, g) === 'ok');
  assert.equal(ok('PATRON'), true);
  assert.equal(ok('PRESTATAIRE'), true);
  for (const role of ['OPERATEUR', 'LIVREUR', 'RESPONSABLE_LIVRAISON']) assert.equal(ok(role), false, role);
});

// ─── Page Comptes ───

test('périodes : aujourd’hui comparé à hier à la même heure ; deux dates comparées à la même durée juste avant', () => {
  const d = accountsRange({ periode: 'jour' }, NOW);
  assert.equal(d.start.toISOString(), '2026-10-17T00:00:00.000Z');
  assert.equal(d.cutoff.toISOString(), NOW.toISOString());
  assert.equal(d.compareEnd.toISOString(), '2026-10-16T21:30:00.000Z');
  const w = accountsRange({ periode: 'semaine' }, NOW);
  assert.equal(w.start.toISOString(), '2026-10-12T00:00:00.000Z'); // lundi
  const x = accountsRange({ periode: 'dates', du: '2026-10-01', au: '2026-10-10' }, NOW);
  assert.equal(x.prevStart.toISOString(), '2026-09-21T00:00:00.000Z');
  assert.equal(x.compareEnd.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(x.isCurrent, false);
  assert.ok(accountsRange({ periode: 'dates', du: '2026-10-10', au: '2026-10-01' }, NOW).error);
  assert.ok(accountsRange({ periode: 'annee' }, NOW).error);
});

test('Comptes : ventes des repas sans frais, livraison / à récupérer, annulées après et avant paiement', () => {
  const a = buildAccounts([
    order('2026-10-17T12:00:00Z', 'LIVREE', 10000, { deliveryFee: 1000, deliveryFeeMethod: 'ESPECES' }),
    order('2026-10-17T13:00:00Z', 'LIVREE', 8000, { deliveryFee: 1500, deliveryFeeMethod: 'MOBILE_MONEY', deliveryOperator: 'PRESTATAIRE' }),
    order('2026-10-17T14:00:00Z', 'PRETE', 4000, { mode: 'A_EMPORTER' }),
    order('2026-10-17T15:00:00Z', 'ANNULEE', 7000, { statusChanges: [paidBy('Awa', '2026-10-17T15:02:00Z'), cancel('2026-10-17T15:30:00Z')] }),
    order('2026-10-17T16:00:00Z', 'ANNULEE', 3000),
    order('2026-10-17T17:00:00Z', 'PAIEMENT_A_VERIFIER', 5000),
    order('2026-10-16T12:00:00Z', 'LIVREE', 9000), // hier avant 21 h 30 : comparaison
    order('2026-10-16T22:00:00Z', 'LIVREE', 9000), // hier après 21 h 30 : pas dans la comparaison
  ], accountsRange({ periode: 'jour' }, NOW), { now: NOW });
  const s = a.summary;
  assert.equal(s.revenue, 22000);
  assert.equal(s.paid, 3);
  assert.equal(s.avgBasket, 7333);
  assert.deepEqual(s.delivery, { count: 2, revenue: 18000 });
  assert.deepEqual(s.pickup, { count: 1, revenue: 4000 });
  assert.deepEqual(s.cancelled, { count: 2, afterPayment: { count: 1, amount: 7000 }, beforePayment: 1 });
  assert.equal(s.pending, 1);
  assert.equal(a.previous.revenue, 9000);
  assert.equal(a.changes.revenue, 144);
  assert.equal(a.comparable, false); // une seule vente hier au même moment : trop tôt pour comparer
  // Frais de nos livreurs (mode Prestataire) : nulle part ; ceux du restaurant : à part, hors ventes
  assert.deepEqual(a.restaurantFees, { count: 1, amount: 1000 });
  assert.equal(JSON.stringify(a).includes('1500'), false);
});

test('Comptes : les commandes d’essai d’avant la date de début des comptes ne comptent pas', () => {
  const range = accountsRange({ periode: 'semaine' }, NOW);
  const a = buildAccounts([
    order('2026-10-13T12:00:00Z', 'LIVREE', 5000), // essai
    order('2026-10-16T12:00:00Z', 'LIVREE', 8000),
  ], range, { since: new Date('2026-10-15T00:00:00Z'), now: NOW });
  assert.equal(a.summary.revenue, 8000);
  assert.equal(a.since, '2026-10-15');
});

test('transactions : toutes, la plus récente d’abord, automatique ou à la main, numéro masqué, jamais le nom', () => {
  const list = transactions([
    order('2026-10-17T12:00:00Z', 'LIVREE', 10000, { customerName: 'Moussa', statusChanges: [auto('2026-10-17T12:01:00Z')] }),
    order('2026-10-17T13:00:00Z', 'PAYEE', 6000, { paymentMethod: 'MOOV_MONEY', paymentPayerPhone: '+22676998877' }),
    order('2026-10-17T14:00:00Z', 'ANNULEE', 7000, { statusChanges: [paidBy('Awa', '2026-10-17T14:05:00Z'), cancel('2026-10-17T14:30:00Z')] }),
    order('2026-10-17T15:00:00Z', 'ANNULEE', 3000), // jamais payée : pas une transaction
    order('2026-10-17T16:00:00Z', 'PAIEMENT_A_VERIFIER', 5000),
  ]);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((t) => t.amount), [7000, 6000, 10000]);
  assert.equal(list[0].cancelled, true);
  assert.equal(list[1].method, 'Moov Money');
  assert.equal(list[1].phone, '76 •• •• 77');
  assert.equal(list[1].auto, false);
  assert.equal(list[1].by, 'Awa');
  assert.equal(list[2].auto, true);
  assert.equal(list[2].by, null);
  assert.equal(JSON.stringify(list).includes('Moussa'), false);
  assert.equal(JSON.stringify(list).includes('70123456'), false);
});

test('numéro masqué et paiement automatique', () => {
  assert.equal(maskPhone('+22670123456'), '70 •• •• 56');
  assert.equal(maskPhone(null), null);
  assert.equal(maskPhone('123'), null);
  assert.equal(isAutoPaid({ statusChanges: [auto(NOW)] }), true);
  assert.equal(isAutoPaid({ statusChanges: [paidBy('Paiement automatique', NOW, 'quelqu-un')] }), false); // un compte qui s'appellerait ainsi
  assert.equal(isAutoPaid({ statusChanges: [] }), false);
});

test('ventes par jour : moyenne par jour ouvert (un mois à 5 samedis ne gonfle pas le samedi)', () => {
  const occ = weekdayOccurrences(new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));
  assert.deepEqual(occ, [4, 4, 4, 5, 5, 5, 4]); // octobre 2026 : 5 jeudis, vendredis, samedis
  const r = rhythm([order('2026-10-17T20:15:00Z', 'LIVREE', 5000)], { start: new Date('2026-10-01T00:00:00Z'), cutoff: new Date('2026-11-01T00:00:00Z') });
  assert.equal(r.hours[20].count, 1);
  assert.equal(r.days[5].revenue, 5000);
  assert.equal(r.days[5].avgRevenue, 1000);
});

// Deux semaines (du lundi 28 septembre au dimanche 11 octobre), 3 ventes par jour sauf le mardi (1)
function twoWeeks() {
  const out = [];
  for (let d = 0; d < 14; d += 1) {
    const day = new Date(Date.UTC(2026, 8, 28 + d));
    const count = day.getUTCDay() === 2 ? 1 : 3;
    for (let i = 0; i < count; i += 1) {
      const t = new Date(day.getTime() + (i === 0 ? 20 : 12 + i) * 3600 * 1000);
      out.push(order(t, 'LIVREE', 5000, { items: [{ productId: 'p1', productName: 'Fuego Wings', quantity: 1, lineTotal: 5000 }] }));
    }
  }
  return out;
}

test('phrases : meilleure heure, meilleur jour, jour le plus calme, plat star, seulement avec assez de données', () => {
  const range = accountsRange({ periode: 'dates', du: '2026-09-28', au: '2026-10-11' }, NOW);
  const a = buildAccounts(twoWeeks(), range, { now: NOW });
  const texts = a.insights.map((i) => i.text);
  assert.ok(texts.includes('Votre meilleure heure : 20 h – 21 h'), texts.join(' | '));
  assert.ok(texts.includes('Le mardi est votre jour le plus calme'), texts.join(' | '));
  assert.ok(texts.some((t) => /^Le (lundi|mercredi) est votre meilleur jour$/.test(t)), texts.join(' | '));
  assert.ok(texts.includes('Plat le plus vendu : Fuego Wings (38 vendus)'), texts.join(' | '));
  // Une seule journée avec 2 ventes : aucune phrase
  const few = buildAccounts([order('2026-10-17T12:00:00Z', 'LIVREE', 5000), order('2026-10-17T13:00:00Z', 'LIVREE', 5000)], accountsRange({ periode: 'jour' }, NOW), { now: NOW });
  assert.deepEqual(few.insights, []);
});

test('phrases : « Ventes en hausse de 12 % par rapport à la semaine dernière au même moment »', () => {
  const sum = (revenue, paid) => ({ revenue, paid, pickup: { count: 0 } });
  const range = { kind: 'semaine', isCurrent: true };
  const r = { hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 })), days: [] };
  const up = insights({ summary: sum(112000, 6), previous: sum(100000, 6), rhythm: r, top: [], range });
  assert.equal(up[0].text, 'Ventes en hausse de 12 % par rapport à la semaine dernière au même moment');
  assert.equal(up[0].tone, 'good');
  const down = insights({ summary: sum(80000, 6), previous: sum(100000, 6), rhythm: r, top: [], range: { kind: 'mois', isCurrent: false } });
  assert.equal(down[0].text, 'Ventes en baisse de 20 % par rapport au mois d’avant');
  const flat = insights({ summary: sum(101000, 6), previous: sum(100000, 6), rhythm: r, top: [], range: { kind: 'jour', isCurrent: true } });
  assert.equal(flat[0].text, 'Ventes stables par rapport à hier à la même heure');
  assert.deepEqual(insights({ summary: sum(112000, 6), previous: sum(100000, 4), rhythm: r, top: [], range }), []);
});

test('carte : zones regroupées d’environ 1 km, jamais un point seul, jamais une commande à récupérer ou non livrée', () => {
  const at = (lat, lng, extra = {}) => order(NOW, 'LIVREE', 5000, { latitude: lat, longitude: lng, ...extra });
  const z = clientZones([
    at(12.3601, -1.5301), at(12.3602, -1.5302), at(12.3603, -1.5303), // même case : 3
    at(12.4001, -1.4801), at(12.4002, -1.4802), // 2 : cachées
    at(12.36, -1.53, { status: 'EN_LIVRAISON' }),
    at(12.36, -1.53, { mode: 'A_EMPORTER' }),
    order(NOW, 'LIVREE', 5000),
  ]);
  assert.equal(z.total, 5);
  assert.equal(z.zones.length, 1);
  assert.equal(z.zones[0].count, 3);
  assert.equal(z.hidden, 2);
  assert.ok(z.zones.every((c) => c.count >= MIN_ZONE));
  assert.notEqual(z.zones[0].lat, 12.3601); // centre de la case, pas la position d'un client
  assert.deepEqual(Object.keys(z.zones[0]).sort(), ['count', 'lat', 'lng']);
});

// ─── Résumés et alertes ───

test('résumé du soir : à l’heure choisie, une seule fois, jamais plus de 3 heures en retard', () => {
  const s = { ...DEFAULT_SETTINGS, eveningHour: 22 };
  assert.deepEqual(dueDigests(new Date('2026-10-17T21:50:00Z'), s, {}), []);
  const due = dueDigests(new Date('2026-10-17T22:05:00Z'), s, {});
  assert.equal(due.length, 1);
  assert.equal(due[0].kind, 'soir');
  assert.equal(due[0].key, '2026-10-17');
  assert.equal(due[0].from.toISOString(), '2026-10-17T00:00:00.000Z');
  assert.deepEqual(dueDigests(new Date('2026-10-17T22:15:00Z'), s, { lastEveningFor: '2026-10-17' }), []);
  assert.deepEqual(dueDigests(new Date('2026-10-18T01:30:00Z'), s, {}), []); // 3 h 30 de retard
  assert.deepEqual(dueDigests(new Date('2026-10-17T22:05:00Z'), { ...s, eveningOn: false }, {}), []);
});

test('résumé du soir après minuit (vendredi et samedi ouverts 24 h/24) : il parle de la veille', () => {
  assert.equal(eveningDay(new Date('2026-10-18T02:00:00Z'), 2).toISOString(), '2026-10-17T00:00:00.000Z');
  const due = dueDigests(new Date('2026-10-18T02:10:00Z'), { ...DEFAULT_SETTINGS, eveningHour: 2 }, {});
  assert.equal(due[0].key, '2026-10-17');
  assert.equal(due[0].to.toISOString(), '2026-10-18T00:00:00.000Z');
});

test('résumé de la semaine : le lundi matin, sur la semaine finie (lundi à dimanche)', () => {
  const s = { ...DEFAULT_SETTINGS, eveningOn: false, weeklyHour: 8 };
  assert.deepEqual(dueDigests(new Date('2026-10-17T08:10:00Z'), s, {}), []); // samedi
  const due = dueDigests(new Date('2026-10-19T08:10:00Z'), s, {}); // lundi
  assert.equal(due.length, 1);
  assert.equal(due[0].kind, 'semaine');
  assert.equal(due[0].from.toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(due[0].to.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.deepEqual(dueDigests(new Date('2026-10-19T08:30:00Z'), s, { lastWeeklyFor: '2026-10-12' }), []);
});

test('résumés : texte court sur le téléphone (ventes, commandes, meilleur plat, note des avis)', () => {
  const evening = digestNotification('soir', { revenue: 125000, paid: 23, topDish: { name: 'Fuego Wings', quantity: 9 }, reviews: { count: 4, average: 4.5 } }, new Date('2026-10-17T00:00:00Z'));
  assert.equal(evening.title, 'Votre journée · samedi 17 octobre');
  assert.equal(evening.body, '125 000 F de ventes · 23 commandes · Meilleur plat : Fuego Wings · Avis : 4,5/5 (4)');
  assert.equal(evening.url, '/equipe/comptes?periode=jour');
  const week = digestNotification('semaine', { revenue: 820000, paid: 160, topDish: null, reviews: { count: 0 }, change: 12 }, new Date('2026-10-12T00:00:00Z'));
  assert.equal(week.title, 'Votre semaine · du 12 octobre au 18 octobre');
  assert.equal(week.body, '820 000 F de ventes (+12 %) · 160 commandes');
  assert.equal(digestNotification('soir', { revenue: 0, paid: 0, reviews: { count: 0 } }, new Date('2026-10-17T00:00:00Z')).body, 'Aucune vente sur cette période.');
});

test('réglage des heures : 0 à 23, rien d’autre accepté', () => {
  assert.deepEqual(digestSettingsSchema.parse({ eveningOn: true, eveningHour: '23', weeklyOn: false, weeklyHour: 7 }), { eveningOn: true, eveningHour: 23, weeklyOn: false, weeklyHour: 7 });
  assert.throws(() => digestSettingsSchema.parse({ eveningOn: true, eveningHour: 24, weeklyOn: true, weeklyHour: 8 }));
  assert.throws(() => digestSettingsSchema.parse({ eveningOn: true, eveningHour: 22, weeklyOn: true, weeklyHour: 8, lastEveningFor: 'x' }));
});

test('mauvais avis pour le Patron : notes basses et commentaire, jamais le nom ni le numéro du client', () => {
  const p = lowReviewForPatron({ reference: 'BC-1', customerName: 'Moussa', customerPhone: '+22670123456' }, { callCenterRating: 5, foodRating: 1, deliveryRating: 2, comment: 'Poulet froid' });
  assert.equal(p.title, 'Mauvais avis · Restaurant 1/5 · Livraison 2/5');
  assert.equal(p.body, '« Poulet froid »');
  assert.equal(JSON.stringify(p).includes('Moussa'), false);
  assert.equal(lowReviewForPatron({ reference: 'BC-2' }, { callCenterRating: 2, foodRating: 4, deliveryRating: null, comment: '' }).body, 'Pas de commentaire.');
  assert.ok(lowReviewForPatron({ reference: 'BC-3' }, { callCenterRating: 1, foodRating: 1, comment: 'x'.repeat(300) }).body.length < 130);
});

test('plat en rupture : alerte une seule fois, après 24 heures ; revenu disponible = oublié', () => {
  const p = [{ id: 'a', name: 'Fuego Wings', isAvailable: false, archivedAt: null }, { id: 'b', name: 'Burger', isAvailable: true, archivedAt: null }];
  const t0 = new Date('2026-10-16T10:00:00Z');
  const first = outageUpdate(p, {}, t0);
  assert.deepEqual(first.alerts, []);
  assert.deepEqual(Object.keys(first.outages), ['a']);
  const later = outageUpdate(p, first.outages, new Date('2026-10-17T10:05:00Z'));
  assert.equal(later.alerts.length, 1);
  assert.equal(later.alerts[0].name, 'Fuego Wings');
  assert.deepEqual(outageUpdate(p, later.outages, new Date('2026-10-17T12:00:00Z')).alerts, []);
  const back = outageUpdate([{ ...p[0], isAvailable: true }], later.outages, new Date('2026-10-17T12:00:00Z'));
  assert.deepEqual(back.outages, {});
  const msg = outageNotification(later.alerts[0], new Date('2026-10-19T10:05:00Z'));
  assert.equal(msg.body, 'Indisponible depuis plus de 3 jours. Remettez-le disponible dans Menu quand il revient.');
});
