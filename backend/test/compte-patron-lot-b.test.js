// Compte Patron simplifié, lot B (même interrupteur COMPTE_PATRON_SIMPLE) : objectif du mois, rapport mensuel,
// clients fidèles sans données personnelles, note des avis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountsRange, buildAccounts, goalProgress, loyalty, monthKey, reviewsSummary } from '../src/services/patron-accounts.js';
import { digestNotification, dueDigests, goalSchema, DEFAULT_SETTINGS } from '../src/services/patron-digest.js';

const NOW = new Date('2026-10-17T21:30:00Z'); // samedi 17 octobre 2026
let n = 0;
const sale = (phone, total, createdAt = '2026-10-17T12:00:00Z', status = 'LIVREE') => {
  n += 1;
  return {
    reference: `BC-B${n}`, createdAt: new Date(createdAt), status, mode: 'LIVRAISON', paymentMethod: 'ORANGE_MONEY',
    paymentPayerPhone: phone, customerPhone: phone, customerName: 'Moussa', itemsTotal: total, deliveryFee: null,
    deliveryFeeMethod: null, deliveryOperator: 'RESTAURANT', latitude: null, longitude: null, items: [],
    statusChanges: [{ toStatus: 'PAYEE', staffUserId: 'a', staffName: 'Awa', createdAt: new Date(createdAt) }],
  };
};

test('objectif du mois : reste à faire, jours restants (aujourd’hui compris), montant par jour arrondi', () => {
  const g = goalProgress(1_500_000, 1_180_000, NOW);
  assert.equal(g.month, '2026-10');
  assert.equal(g.remaining, 320_000);
  assert.equal(g.daysLeft, 15); // du 17 au 31 octobre
  assert.equal(g.perDay, 21_400); // 21 333 arrondi aux 100 F au-dessus
  assert.equal(g.pct, 78);
  assert.equal(g.text, 'Encore 320 000 F en 15 jours, soit 21 400 F par jour');
  const done = goalProgress(1_000_000, 1_250_000, NOW);
  assert.equal(done.reached, true);
  assert.equal(done.pct, 100);
  assert.equal(done.text, 'Objectif du mois atteint : 1 250 000 F sur 1 000 000 F');
  assert.equal(goalProgress(0, 5000, NOW), null);
  assert.equal(goalProgress(100_000, 0, new Date('2026-10-31T23:00:00Z')).daysLeft, 1);
  assert.equal(monthKey(NOW), '2026-10');
});

test('objectif : montant entier, positif ; 0 = retirer', () => {
  assert.deepEqual(goalSchema.parse({ montant: '1500000' }), { montant: 1_500_000 });
  assert.deepEqual(goalSchema.parse({ montant: 0 }), { montant: 0 });
  assert.throws(() => goalSchema.parse({ montant: -1 }));
  assert.throws(() => goalSchema.parse({ montant: 12.5 }));
  assert.throws(() => goalSchema.parse({ montant: 100, mois: '2026-09' }));
});

test('clients fidèles : revenus, nouveaux, habitués, meilleurs clients en rang seulement, jamais de numéro', () => {
  const sales = [
    sale('+22670000001', 10000), sale('+22670000001', 8000), sale('+22670000001', 6000), // 3 fois
    sale('+22670000002', 5000), sale('+22670000002', 5000), // 2 fois
    sale('+22670000003', 7000), // déjà venu avant
    sale('+22670000004', 4000), // nouveau
  ];
  const l = loyalty(sales, new Set(['+22670000003']));
  assert.equal(l.customers, 4);
  assert.equal(l.returning, 1);
  assert.equal(l.newCustomers, 3);
  assert.equal(l.repeat, 2);
  assert.equal(l.loyalShare, 86); // 6 commandes d'habitués sur 7
  assert.deepEqual(l.top, [{ rank: 1, orders: 3, revenue: 24000 }, { rank: 2, orders: 2, revenue: 10000 }]);
  assert.equal(JSON.stringify(l).includes('2267'), false);
});

test('page Comptes : clients, note des avis et objectif, sans numéro ni nom du client', () => {
  const orders = [];
  for (let i = 0; i < 12; i += 1) orders.push(sale(`+226700001${String(i).padStart(2, '0')}`, 5000));
  orders.push(sale('+22670000100', 5000, '2026-10-17T13:00:00Z'));
  const goal = goalProgress(1_000_000, 400_000, NOW);
  const a = buildAccounts(orders, accountsRange({ periode: 'jour' }, NOW), {
    now: NOW,
    earlier: new Set(['+22670000101', '+22670000102']),
    reviews: [{ callCenterRating: 5, foodRating: 4, deliveryRating: null, lowRating: false }, { callCenterRating: 2, foodRating: 5, deliveryRating: 5, lowRating: true }],
    goal,
  });
  assert.equal(a.clients.customers, 12);
  assert.equal(a.clients.returning, 2);
  assert.deepEqual(a.reviews, { count: 2, average: 4.2, low: 1 });
  assert.equal(a.goal.pct, 40);
  assert.ok(a.insights.some((i) => i.text === '2 clients sont revenus sur 12'));
  const json = JSON.stringify(a);
  assert.equal(json.includes('+2267000010'), false);
  assert.equal(json.includes('70000100'), false); // masqué : 70 •• •• 00
  assert.equal(json.includes('Moussa'), false);
});

test('note des avis : moyenne de toutes les notes données', () => {
  assert.deepEqual(reviewsSummary([]), { count: 0, average: null, low: 0 });
});

test('rapport du mois : annoncé le 1er à l’heure du résumé de la semaine, une seule fois', () => {
  const due = dueDigests(new Date('2026-11-01T08:10:00Z'), { ...DEFAULT_SETTINGS, eveningOn: false }, {});
  const month = due.find((d) => d.kind === 'mois');
  assert.equal(month.key, '2026-10');
  assert.equal(month.from.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(month.to.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(dueDigests(new Date('2026-11-01T08:10:00Z'), DEFAULT_SETTINGS, { lastMonthlyFor: '2026-10' }).some((d) => d.kind === 'mois'), false);
  assert.equal(dueDigests(new Date('2026-11-01T08:10:00Z'), { ...DEFAULT_SETTINGS, monthlyOn: false }, {}).some((d) => d.kind === 'mois'), false);
  assert.equal(dueDigests(new Date('2026-11-02T08:10:00Z'), DEFAULT_SETTINGS, {}).some((d) => d.kind === 'mois'), false);
  // Janvier : le rapport de décembre de l'année d'avant
  assert.equal(dueDigests(new Date('2027-01-01T08:30:00Z'), DEFAULT_SETTINGS, {}).find((d) => d.kind === 'mois').key, '2026-12');
});

test('notifications : rapport prêt (lien vers la page à imprimer) et objectif dans le résumé du soir', () => {
  const m = digestNotification('mois', { revenue: 4_200_000, paid: 610 }, new Date('2026-10-01T00:00:00Z'));
  assert.equal(m.title, 'Votre rapport de octobre 2026 est prêt');
  assert.equal(m.body, '4 200 000 F de ventes · 610 commandes. Touchez pour l’ouvrir.');
  assert.equal(m.url, '/equipe/comptes/rapport?mois=2026-10');
  const e = digestNotification('soir', { revenue: 100000, paid: 10, topDish: null, reviews: { count: 0 }, goalPct: 62 }, new Date('2026-10-17T00:00:00Z'));
  assert.equal(e.body, '100 000 F de ventes · 10 commandes · Objectif du mois : 62 %');
});
