// Lot 6 : ventes par période, provenance et agent (règles sans base de données, sales.js) et fichier Excel
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildSales, minutesText, sourceKey, verificationOf } from '../src/services/sales.js';
import { salesWorkbook } from '../src/services/sales-excel.js';
import { featureMap } from '../src/services/features.js';
import { parsePeriod } from '../src/services/statement.js';

const NOW = new Date('2026-10-11T15:00:00Z');
const PERIOD = parsePeriod('2026-10-01', '2026-10-11', NOW);
const t = (day, hh, mm = 0) => new Date(Date.UTC(2026, 9, day, hh, mm));

const SOURCES = [
  { id: 'src-site', name: 'Site', kind: 'SITE', position: 0, isActive: true },
  { id: 'src-appel', name: 'Appel', kind: 'APPEL', position: 1, isActive: true },
  { id: 'src-wa1', name: 'WhatsApp +226 05 23 48 48', kind: 'WHATSAPP', position: 2, isActive: true },
  { id: 'src-wa2', name: 'WhatsApp +226 50 62 70 70 (Telmob)', kind: 'WHATSAPP', position: 3, isActive: true },
  { id: 'src-old', name: 'Facebook', kind: 'AUTRE', position: 4, isActive: false },
  { id: 'src-new', name: 'Instagram', kind: 'AUTRE', position: 5, isActive: true },
];

let n = 0;
// Commande d'essai : payée par Awa 10 minutes après son arrivée, sauf indication contraire
function order({
  status = 'LIVREE', day = 5, hour = 12, total = 5000, method = 'ORANGE_MONEY', mode = 'LIVRAISON', source = null,
  agent = null, verifier = 'awa', verifyAfter = 10, cancel = null, fee = null, feeMethod = null, operator = 'RESTAURANT',
} = {}) {
  n += 1;
  const createdAt = t(day, hour);
  const changes = [];
  if (verifier && status !== 'PAIEMENT_A_VERIFIER') {
    changes.push({ toStatus: 'PAYEE', fromStatus: 'PAIEMENT_A_VERIFIER', staffUserId: verifier, staffName: verifier === 'awa' ? 'Awa' : 'Moussa', createdAt: new Date(createdAt.getTime() + verifyAfter * 60000), staffUser: { role: 'OPERATEUR' } });
  }
  if (status === 'ANNULEE') {
    changes.push({ toStatus: 'ANNULEE', fromStatus: cancel?.from || 'PAIEMENT_A_VERIFIER', reason: cancel?.reason || 'Client injoignable', staffName: 'Awa', createdAt: new Date(createdAt.getTime() + 60 * 60000) });
  }
  const src = SOURCES.find((s) => s.id === source);
  return {
    reference: `BC-T${n}`,
    status,
    mode,
    paymentMethod: method,
    itemsTotal: total,
    deliveryFee: fee,
    deliveryFeeMethod: feeMethod,
    deliveryOperator: operator,
    sourceId: source,
    sourceName: src?.name || null,
    source: src ? { kind: src.kind } : null,
    createdById: agent,
    createdByName: agent ? (agent === 'awa' ? 'Awa' : 'Moussa') : null,
    createdBy: agent ? { role: 'OPERATEUR' } : null,
    createdAt,
    statusChanges: changes,
    customerName: 'Ne doit jamais sortir',
    customerPhone: '+22670000000',
  };
}

const build = (orders, opts = {}) => buildSales(orders, SOURCES, PERIOD, { now: NOW, ...opts });

test('ventes globales : seulement les commandes payées et au-delà ; annulées et à vérifier à part', () => {
  const s = build([
    order({ total: 5000 }),
    order({ status: 'EN_PREPARATION', total: 3000, method: 'MOOV_MONEY' }),
    order({ status: 'PRETE', mode: 'A_EMPORTER', total: 2000, method: 'TELECEL_MONEY' }),
    order({ status: 'PRETE_LIVRAISON', total: 1000, operator: 'PRESTATAIRE' }),
    order({ status: 'ANNULEE', total: 9000, cancel: { from: 'PAYEE', reason: 'Plus de poulet' } }),
    order({ status: 'PAIEMENT_A_VERIFIER', total: 4000, verifier: null }),
  ]);
  assert.equal(s.summary.received, 6);
  assert.equal(s.summary.orders, 4);
  assert.equal(s.summary.revenue, 11000);
  assert.equal(s.summary.avgBasket, 2750);
  assert.deepEqual(s.summary.cancelled, { count: 1, amount: 9000 });
  assert.deepEqual(s.summary.pending, { count: 1, amount: 4000 });
  assert.deepEqual(s.payments.map((p) => [p.method, p.count, p.amount]), [['ORANGE_MONEY', 2, 6000], ['MOOV_MONEY', 1, 3000], ['TELECEL_MONEY', 1, 2000]]);
  assert.deepEqual(s.modes.map((m) => [m.mode, m.count, m.amount]), [['LIVRAISON', 3, 9000], ['A_EMPORTER', 1, 2000]]);
  assert.equal(s.cancellations[0].stage, 'Payée');
  assert.equal(s.cancellations[0].reason, 'Plus de poulet');
  assert.equal(s.cancellations[0].paymentWasVerified, true);
});

test('frais de livraison jamais dans les ventes ; ceux de notre partenaire jamais comptés du tout', () => {
  const s = build([
    order({ total: 5000, fee: 1000, feeMethod: 'ESPECES' }),
    order({ total: 5000, fee: 700, feeMethod: 'MOBILE_MONEY' }),
    order({ total: 5000, fee: 1234, feeMethod: 'ESPECES', operator: 'PRESTATAIRE' }),
    order({ status: 'ANNULEE', total: 5000, fee: 900, feeMethod: 'ESPECES' }),
  ]);
  assert.equal(s.summary.revenue, 15000);
  assert.deepEqual(s.restaurantFees, { count: 2, amount: 1700, cash: { count: 1, amount: 1000 }, mobile: { count: 1, amount: 700 } });
  assert.ok(!JSON.stringify(s).includes('1234'), 'les frais du partenaire n’apparaissent nulle part');
});

test('espèces (anciennes commandes) : ligne seulement s’il y en a', () => {
  assert.equal(build([order()]).payments.length, 3);
  const s = build([order(), order({ method: 'ESPECES', total: 2500 })]);
  assert.deepEqual(s.payments.at(-1), { method: 'ESPECES', label: 'Espèces (anciennes commandes)', count: 1, amount: 2500 });
});

test('période : dates incluses, rien en dehors, jour coupé à minuit (heure du Burkina = UTC)', () => {
  const s = build([order({ day: 1, hour: 0 }), order({ day: 11, hour: 14 }), order({ day: 6 }), { ...order(), createdAt: new Date('2026-09-30T23:59:00Z') }, { ...order(), createdAt: new Date('2026-10-12T00:00:00Z') }]);
  assert.equal(s.summary.received, 3);
  assert.deepEqual(s.period, { du: '2026-10-01', au: '2026-10-11', days: 11 });
  assert.ok(parsePeriod('2026-10-01', '2026-10-12', NOW).error, 'pas de période dans l’avenir');
  assert.ok(parsePeriod('2025-01-01', '2026-10-11', NOW).error, '366 jours au plus');
});

test('par provenance : Site d’abord, chaque provenance du Patron, désactivée seulement si elle a servi', () => {
  const s = build([
    order({ total: 5000 }),
    order({ total: 4000, source: 'src-appel', agent: 'awa' }),
    order({ total: 3000, source: 'src-wa2', agent: 'moussa', method: 'MOOV_MONEY' }),
    order({ total: 2000, source: 'src-new', agent: 'moussa' }),
    order({ status: 'ANNULEE', total: 8000, source: 'src-wa1', agent: 'awa' }),
  ]);
  assert.deepEqual(s.sources.map((r) => r.name), ['Site', 'Appel', 'WhatsApp +226 05 23 48 48', 'WhatsApp +226 50 62 70 70 (Telmob)', 'Instagram']);
  const by = Object.fromEntries(s.sources.map((r) => [r.name, r]));
  assert.equal(by.Site.revenue, 5000);
  assert.equal(by.Appel.revenue, 4000);
  assert.equal(by['WhatsApp +226 05 23 48 48'].orders, 0);
  assert.deepEqual(by['WhatsApp +226 05 23 48 48'].cancelled, { count: 1, amount: 8000 });
  assert.equal(by['WhatsApp +226 50 62 70 70 (Telmob)'].payments.find((p) => p.method === 'MOOV_MONEY').amount, 3000);
  assert.equal(by.Instagram.revenue, 2000, 'nouvelle provenance du Patron prise en compte');
  // Provenance désactivée, mais utilisée dans la période : elle revient
  const s2 = build([order({ source: 'src-old', agent: 'awa' })]);
  assert.ok(s2.sources.some((r) => r.name === 'Facebook' && r.isActive === false && r.orders === 1));
  // Provenance vide = Site ; la ligne « Site » de la base aussi
  assert.equal(sourceKey({ sourceId: null, sourceName: null }), 'SITE');
  assert.equal(sourceKey({ sourceId: 'src-site', source: { kind: 'SITE' } }), 'SITE');
});

test('par agent : saisies et paiements vérifiés séparés, deux agents différents', () => {
  const s = build([
    order({ total: 4000, source: 'src-appel', agent: 'moussa', verifier: 'awa', verifyAfter: 2 }),
    order({ total: 6000, source: 'src-wa1', agent: 'moussa', verifier: 'moussa', verifyAfter: 4, method: 'TELECEL_MONEY' }),
    order({ total: 5000, verifier: 'awa', verifyAfter: 20 }),
    order({ total: 3000, verifier: 'awa', verifyAfter: 30 }),
    order({ status: 'ANNULEE', total: 7000, verifier: 'awa', verifyAfter: 12, cancel: { from: 'EN_PREPARATION' } }),
    order({ status: 'PAIEMENT_A_VERIFIER', total: 1000, agent: 'awa', verifier: null, source: 'src-appel' }),
  ]);
  const entered = Object.fromEntries(s.enteredBy.map((r) => [r.name, r]));
  assert.deepEqual(Object.keys(entered), ['Awa', 'Moussa']);
  assert.equal(entered.Moussa.orders, 2);
  assert.equal(entered.Moussa.revenue, 10000);
  assert.equal(entered.Moussa.payments.find((p) => p.method === 'TELECEL_MONEY').amount, 6000);
  assert.equal(entered.Awa.orders, 0);
  assert.equal(entered.Awa.pending.count, 1);

  const verified = Object.fromEntries(s.verifiedBy.map((r) => [r.name, r]));
  assert.equal(verified.Awa.verified, 4);
  assert.equal(verified.Awa.orders, 3, 'l’annulée ensuite n’est pas une vente');
  assert.equal(verified.Awa.revenue, 12000);
  assert.deepEqual(verified.Awa.cancelled, { count: 1, amount: 7000 });
  assert.equal(verified.Awa.delay.avgMinutes, 16); // (2 + 20 + 30 + 12) / 4
  assert.equal(verified.Awa.delay.siteAvgMinutes, 21); // (20 + 30 + 12) / 3, sans la commande saisie par Moussa
  assert.equal(verified.Awa.delay.maxMinutes, 30);
  assert.equal(verified.Moussa.verified, 1);
  assert.equal(verified.Moussa.delay.siteAvgMinutes, null);

  assert.deepEqual(s.verification, { count: 5, avgMinutes: 14, siteCount: 3, siteAvgMinutes: 21, agentCount: 2, agentAvgMinutes: 3 });
});

test('parcours court : la vérification est la ligne « Payée » écrite dans l’historique', () => {
  const o = order({ status: 'EN_PREPARATION', verifyAfter: 7 });
  assert.equal(verificationOf(o).minutes, 7);
  assert.equal(verificationOf({ ...o, statusChanges: [] }), null);
  // Compte supprimé : le nom copié reste
  const gone = { ...o, statusChanges: [{ ...o.statusChanges[0], staffUserId: null, staffName: 'Ancien agent' }] };
  assert.equal(verificationOf(gone).name, 'Ancien agent');
});

test('jamais le nom ni le téléphone du client, ni sur la page ni dans le détail de l’Excel', () => {
  const s = build([order(), order({ status: 'ANNULEE' })], { withOrders: true });
  const text = JSON.stringify(s);
  assert.ok(!text.includes('Ne doit jamais sortir'));
  assert.ok(!text.includes('70000000'));
  assert.equal(build([order()]).orders, undefined, 'détail seulement pour l’Excel');
  assert.equal(s.orders.length, 2);
});

test('interrupteur VENTES : ouvert sans ligne, fermé si le Prestataire le ferme', () => {
  assert.equal(featureMap([]).VENTES, true);
  assert.equal(featureMap([{ key: 'VENTES', enabled: false }]).VENTES, false);
});

test('délai écrit en clair', () => {
  assert.equal(minutesText(null), '—');
  assert.equal(minutesText(12), '12 min');
  assert.equal(minutesText(65), '1 h 05');
});

test('Excel : un vrai fichier .xlsx, montants en nombres, sans données du client', async () => {
  const s = build([
    order({ total: 5000, source: 'src-appel', agent: 'awa' }),
    order({ status: 'ANNULEE', total: 2000 }),
    order({ total: 3000, method: 'ESPECES' }),
  ], { withOrders: true });
  const wb = await salesWorkbook(s);
  const buffer = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buffer);
  assert.deepEqual(back.worksheets.map((w) => w.name), ['Résumé', 'Par provenance', 'Agents – saisies', 'Agents – vérifications', 'Annulées', 'Commandes']);
  const sheet = back.getWorksheet('Commandes');
  const amounts = [];
  sheet.eachRow((row, i) => { if (i > 2) amounts.push(row.getCell(12).value); });
  assert.deepEqual(amounts, [5000, 2000, 3000]);
  let all = '';
  back.eachSheet((w) => w.eachRow((row) => { all += JSON.stringify(row.values); }));
  assert.ok(!all.includes('Ne doit jamais sortir'));
  assert.ok(all.includes('Espèces (anciennes commandes)'));
});
