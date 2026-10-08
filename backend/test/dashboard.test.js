import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, dashboardQuerySchema, periodRange } from '../src/services/dashboard.js';

// Vendredi 2 octobre 2026, 14 h 30 (heure du Burkina = UTC)
const NOW = new Date('2026-10-02T14:30:00Z');
const iso = (d) => d.toISOString();

let n = 0;
const order = (createdAt, status, total, extra = {}) => ({
  reference: `BC-${++n}`,
  customerName: 'Client',
  createdAt: new Date(createdAt),
  status,
  paymentMethod: 'ORANGE_MONEY',
  itemsTotal: total,
  items: [{ productId: 'p1', productName: 'Finest', quantity: 1, lineTotal: total, categoryName: 'Burgers' }],
  ...extra,
});

test('période du jour : comparée à hier à la même heure', () => {
  const r = periodRange('day', 0, NOW);
  assert.equal(iso(r.start), '2026-10-02T00:00:00.000Z');
  assert.equal(iso(r.cutoff), '2026-10-02T14:30:00.000Z');
  assert.equal(iso(r.prevStart), '2026-10-01T00:00:00.000Z');
  assert.equal(iso(r.compareEnd), '2026-10-01T14:30:00.000Z');
  // Un jour passé se compare à la veille entière
  const y = periodRange('day', -1, NOW);
  assert.equal(iso(y.start), '2026-10-01T00:00:00.000Z');
  assert.equal(iso(y.cutoff), '2026-10-02T00:00:00.000Z');
  assert.equal(iso(y.compareEnd), '2026-10-01T00:00:00.000Z');
});

test('semaine du lundi au dimanche, mois civil', () => {
  const w = periodRange('week', 0, NOW);
  assert.equal(iso(w.start), '2026-09-28T00:00:00.000Z'); // lundi
  assert.equal(iso(w.prevStart), '2026-09-21T00:00:00.000Z');
  assert.equal(iso(w.compareEnd), '2026-09-25T14:30:00.000Z');
  const m = periodRange('month', -1, NOW);
  assert.equal(iso(m.start), '2026-09-01T00:00:00.000Z');
  assert.equal(iso(m.end), '2026-10-01T00:00:00.000Z');
  assert.equal(iso(m.prevStart), '2026-08-01T00:00:00.000Z');
  // Janvier : le mois précédent est décembre de l'année d'avant
  const j = periodRange('month', -9, NOW);
  assert.equal(iso(j.start), '2026-01-01T00:00:00.000Z');
  assert.equal(iso(j.prevStart), '2025-12-01T00:00:00.000Z');
});

test('chiffre d\'affaires : seules les commandes payées et au-delà comptent', () => {
  const range = periodRange('day', 0, NOW);
  const orders = [
    order('2026-10-02T09:10:00Z', 'PAYEE', 5000, { deliveryFee: 1000 }), // frais saisis, pas encore reçus
    order('2026-10-02T12:00:00Z', 'LIVREE', 3000, { paymentMethod: 'MOOV_MONEY', deliveryFee: 1500, deliveryFeeMethod: 'ESPECES' }), // payés au livreur en espèces
    order('2026-10-02T12:30:00Z', 'EN_PREPARATION', 4000, { deliveryFee: 500, deliveryFeeMethod: 'MOBILE_MONEY' }), // ancienne commande : payés avant le départ
    order('2026-10-02T13:00:00Z', 'PAIEMENT_A_VERIFIER', 9000),
    order('2026-10-02T13:30:00Z', 'ANNULEE', 7000, { cancelReason: 'Client injoignable', deliveryFee: 800, deliveryFeeMethod: 'MOBILE_MONEY' }), // annulée : frais retirés
    order('2026-10-02T13:45:00Z', 'ANNULEE', 2000, { cancelReason: 'client injoignable ' }),
    order('2026-10-02T15:00:00Z', 'PAYEE', 99999), // après maintenant : ignorée
    order('2026-10-01T10:00:00Z', 'PAYEE', 6000), // hier avant 14 h 30 : comparaison
    order('2026-10-01T20:00:00Z', 'PAYEE', 50000), // hier après 14 h 30 : hors comparaison
  ];
  const d = buildDashboard(orders, range);
  // revenue = plats seulement ; frais de livraison à part, une fois reçus, hors commandes annulées
  assert.deepEqual(d.summary, { received: 6, paid: 3, revenue: 12000, deliveryRevenue: 2000, deliveryPaid: 2, deliveryCash: 1500, deliveryCashCount: 1, deliveryMobile: 500, deliveryMobileCount: 1, avgBasket: 4000, cancelled: 2, toVerify: 1 });
  assert.equal(d.previous.revenue, 6000);
  assert.equal(d.timeline.length, 24);
  assert.equal(d.timeline[12].revenue, 7000);
  assert.equal(d.hours[13], 1); // 13 h 00 en attente ; les deux annulées de 13 h 30 et 13 h 45 ne comptent pas
  assert.deepEqual(d.payments.map((p) => [p.method, p.paid, p.revenue]), [['ORANGE_MONEY', 2, 9000], ['MOOV_MONEY', 1, 3000], ['TELECEL_MONEY', 0, 0]]);
  assert.deepEqual(d.topProducts, [{ name: 'Finest', quantity: 3, revenue: 12000 }]);
  assert.deepEqual(d.topCategories, [{ name: 'Burgers', quantity: 3, revenue: 12000 }]);
  // Motifs regroupés sans tenir compte des majuscules ni des espaces
  assert.deepEqual(d.cancellations.reasons, [{ reason: 'Client injoignable', count: 2 }]);
  assert.equal(d.cancellations.latest.length, 2);
});

test('plats les plus vendus par quantité, catégories par chiffre d\'affaires, plats supprimés gardés', () => {
  const range = periodRange('month', 0, NOW);
  const items = [
    { productId: 'a', productName: 'Wings', quantity: 5, lineTotal: 10000, categoryName: 'Poulet' },
    { productId: 'b', productName: 'Finest', quantity: 2, lineTotal: 11000, categoryName: 'Burgers' },
    { productId: null, productName: 'Ancien plat', quantity: 1, lineTotal: 500, categoryName: null },
  ];
  const d = buildDashboard([order('2026-10-02T10:00:00Z', 'LIVREE', 21500, { items })], range);
  assert.deepEqual(d.topProducts.map((p) => p.name), ['Wings', 'Finest', 'Ancien plat']);
  assert.deepEqual(d.topCategories.map((c) => c.name), ['Burgers', 'Poulet', 'Plats retirés du menu']);
  assert.equal(d.timeline.length, 31);
  assert.equal(d.weekdays[4], 1); // vendredi
});

test('commandes annulées : exclues de toutes les statistiques, même annulées après le paiement ou en livraison', () => {
  const range = periodRange('day', 0, NOW);
  const courier = { courierId: 'l1', courierName: 'Moussa', startedAt: new Date('2026-10-02T11:10:00Z') };
  const orders = [
    // Payée, partie avec le livreur, puis annulée : rien ne doit compter
    order('2026-10-02T11:00:00Z', 'ANNULEE', 8000, { ...courier, paymentMethod: 'MOOV_MONEY', deliveryFee: 700, deliveryFeeMethod: 'ESPECES', deliveredAt: new Date('2026-10-02T11:40:00Z') }),
    order('2026-10-02T10:00:00Z', 'LIVREE', 5000, { ...courier, deliveredAt: new Date('2026-10-02T11:30:00Z') }),
  ];
  const d = buildDashboard(orders, range);
  assert.equal(d.summary.revenue, 5000);
  assert.equal(d.summary.paid, 1);
  assert.equal(d.summary.avgBasket, 5000);
  assert.equal(d.summary.deliveryRevenue, 0);
  assert.equal(d.timeline.reduce((s, t) => s + t.revenue, 0), 5000);
  assert.deepEqual(d.topProducts, [{ name: 'Finest', quantity: 1, revenue: 5000 }]);
  assert.deepEqual(d.topCategories, [{ name: 'Burgers', quantity: 1, revenue: 5000 }]);
  assert.deepEqual(d.payments.map((p) => [p.method, p.paid, p.revenue]), [['ORANGE_MONEY', 1, 5000], ['MOOV_MONEY', 0, 0], ['TELECEL_MONEY', 0, 0]]);
  assert.equal(d.hours[11], 0);
  assert.equal(d.hours[10], 1);
  assert.equal(d.weekdays.reduce((s, v) => s + v, 0), 1);
  assert.deepEqual(d.couriers.map((c) => [c.name, c.delivered]), [['Moussa', 1]]);
  // Elle reste visible dans la carte « Commandes annulées »
  assert.equal(d.summary.cancelled, 1);
  assert.equal(d.cancellations.count, 1);
});

test('paramètres : période connue, pas de période future', () => {
  assert.deepEqual(dashboardQuerySchema.parse({}), { period: 'day', offset: 0 });
  assert.deepEqual(dashboardQuerySchema.parse({ period: 'month', offset: '-2' }), { period: 'month', offset: -2 });
  assert.throws(() => dashboardQuerySchema.parse({ period: 'year' }));
  assert.throws(() => dashboardQuerySchema.parse({ offset: '1' }));
});
