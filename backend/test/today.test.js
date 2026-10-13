import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToday, todayRanges, topProducts, todaySources } from '../src/services/today.js';
import { buildDashboard, periodRange } from '../src/services/dashboard.js';

// Mardi 13 octobre 2026, 14 h 30 (heure du Burkina = UTC)
const NOW = new Date('2026-10-13T14:30:00Z');
const iso = (d) => d.toISOString();
const order = (createdAt, status, total, extra = {}) => ({
  createdAt: new Date(createdAt),
  status,
  paymentMethod: 'ORANGE_MONEY',
  itemsTotal: total,
  deliveryFee: null,
  deliveryFeeMethod: null,
  deliveryOperator: 'RESTAURANT',
  sourceId: null,
  sourceName: null,
  items: [],
  ...extra,
});

test('tranches : aujourd’hui, hier et mardi dernier, jusqu’à la même heure ; 7 jours depuis mercredi dernier', () => {
  const r = todayRanges(NOW);
  assert.equal(iso(r.today.start), '2026-10-13T00:00:00.000Z');
  assert.equal(iso(r.today.end), '2026-10-13T14:30:00.000Z');
  assert.equal(iso(r.yesterday.start), '2026-10-12T00:00:00.000Z');
  assert.equal(iso(r.yesterday.end), '2026-10-12T14:30:00.000Z');
  assert.equal(iso(r.lastWeek.start), '2026-10-06T00:00:00.000Z');
  assert.equal(iso(r.lastWeek.end), '2026-10-06T14:30:00.000Z');
  assert.equal(iso(r.weekStart), '2026-10-07T00:00:00.000Z');
});

test('chiffres du jour : mêmes règles que le tableau de bord (payées, frais, partenaire)', () => {
  const orders = [
    order('2026-10-13T09:00:00Z', 'LIVREE', 10000, { deliveryFee: 1000, deliveryFeeMethod: 'ESPECES' }),
    order('2026-10-13T10:00:00Z', 'EN_PREPARATION', 6000),
    order('2026-10-13T11:00:00Z', 'PAIEMENT_A_VERIFIER', 9000), // pas encore payée
    order('2026-10-13T12:00:00Z', 'ANNULEE', 8000),
    order('2026-10-13T13:00:00Z', 'LIVREE', 5000, { deliveryFee: 1500, deliveryFeeMethod: 'MOBILE_MONEY', deliveryOperator: 'PRESTATAIRE' }),
    order('2026-10-12T14:00:00Z', 'LIVREE', 7000), // hier avant 14 h 30 : comptée
    order('2026-10-12T15:00:00Z', 'LIVREE', 99000), // hier après 14 h 30 : pas dans la comparaison
    order('2026-10-06T08:00:00Z', 'LIVREE', 4000),
  ];
  const t = buildToday({ orders, ranges: todayRanges(NOW) });
  assert.deepEqual(t.today, { revenue: 21000, paid: 3, avgBasket: 7000, deliveryRevenue: 1000, deliveryPaid: 1 });
  assert.equal(t.yesterday.revenue, 7000);
  assert.equal(t.lastWeek.revenue, 4000);
  assert.equal(iso(t.lastWeekDay), '2026-10-06T00:00:00.000Z');

  // Le chiffre du jour est celui de l'analyse détaillée (« Aujourd'hui ») au même moment
  const old = buildDashboard(orders, periodRange('day', 0, NOW));
  assert.equal(t.today.revenue, old.summary.revenue);
  assert.equal(t.today.paid, old.summary.paid);
  assert.equal(t.today.avgBasket, old.summary.avgBasket);
  assert.equal(t.today.deliveryRevenue, old.summary.deliveryRevenue);
  assert.equal(t.yesterday.revenue, old.previous.revenue);
});

test('plats les plus vendus : par quantité, un plat renommé reste une seule ligne, 5 au plus', () => {
  const g = (productId, productName, quantity, lineTotal) => ({ productId, productName, _sum: { quantity, lineTotal } });
  const top = topProducts([
    g('a', 'Smoky', 3, 16500),
    g('a', 'Smoky XL', 5, 32500), // même plat, renommé : garde le nom le plus vendu
    g('b', 'Finest', 4, 22000),
    g(null, 'Ancien plat', 6, 6000), // plat supprimé du menu : par son nom
    g('c', 'Fanta', 2, 2000),
    g('d', 'Grill', 2, 11000),
    g('e', 'Bucket', 1, 28000),
    g('f', 'Zéro', 0, 0),
  ]);
  assert.deepEqual(top.map((p) => [p.name, p.quantity]), [['Smoky XL', 8], ['Ancien plat', 6], ['Finest', 4], ['Grill', 2], ['Fanta', 2]]);
  assert.equal(top[0].revenue, 49000);
  assert.deepEqual(topProducts([]), []);
});

test('provenance du jour : cachée s’il n’y a que le site, sinon les provenances qui ont vendu', () => {
  const sources = [
    { id: 's1', name: 'Appel', kind: 'APPEL', position: 1, isActive: true },
    { id: 's2', name: 'WhatsApp', kind: 'WHATSAPP', position: 2, isActive: true },
  ];
  const site = [order('2026-10-13T09:00:00Z', 'LIVREE', 10000), order('2026-10-13T09:30:00Z', 'PAYEE', 5000)];
  assert.deepEqual(todaySources(site, sources), []);
  const rows = todaySources([...site, order('2026-10-13T10:00:00Z', 'LIVREE', 8000, { sourceId: 's1', sourceName: 'Appel' }), order('2026-10-13T10:00:00Z', 'ANNULEE', 8000, { sourceId: 's2', sourceName: 'WhatsApp' })], sources);
  assert.deepEqual(rows.map((r) => [r.name, r.orders, r.revenue]), [['Site', 2, 15000], ['Appel', 1, 8000]]);
  assert.deepEqual(todaySources([], sources), []);
});
