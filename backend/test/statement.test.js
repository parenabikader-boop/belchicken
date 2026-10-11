// Lot 5d : relevé de livraison, conditions du contrat (versions datées), montant dû, Excel.
// Sans base de données : les règles de statement.js et le fichier de statement-excel.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  buildStatement, canDeleteTerms, checkTerms, computeAmountDue, forViewer, parsePeriod, seesContract, termsOn,
} from '../src/services/statement.js';
import { statementWorkbook } from '../src/services/statement-excel.js';
import { featureMap } from '../src/services/features.js';

const NOW = new Date('2026-10-20T15:00:00Z');
const d = (text) => new Date(`${text}T00:00:00Z`);
const at = (text) => new Date(text);
const version = (id, validFrom, kind, extra = {}) => ({
  id, validFrom: d(validFrom), kind, perDeliveryPrice: null, monthlyFee: null, freeDeliveryPrice: 0, note: null, createdByName: 'Presta', createdAt: d(validFrom), ...extra,
});
const days = (entries) => new Map(Object.entries(entries));
const period = (du, au) => parsePeriod(du, au, NOW);

// ─── Période ───

test('période : dates libres, fin au plus tard aujourd’hui, 366 jours au plus', () => {
  const p = period('2026-10-01', '2026-10-20');
  assert.equal(p.from.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(p.end.toISOString(), '2026-10-21T00:00:00.000Z'); // le dernier jour est compris
  assert.match(period('2026-10-05', '2026-10-01').error, /avant son début/);
  assert.match(period('2026-10-01', '2026-10-21').error, /après aujourd’hui/);
  assert.match(period('2025-01-01', '2026-10-01').error, /366 jours/);
  assert.ok(period('2025-10-20', '2026-10-20').from); // 366 jours tout juste
  assert.ok(period('2026-02-31', '2026-03-01').error); // date qui n'existe pas
  assert.ok(period('', '2026-10-01').error);
});

// ─── Conditions du contrat ───

test('conditions : date d’effet aujourd’hui ou plus tard, montant obligatoire selon la formule', () => {
  assert.match(checkTerms({ validFrom: '2026-10-19', kind: 'AUCUNE' }, NOW).error, /aujourd’hui ou plus tard/);
  assert.equal(checkTerms({ validFrom: '2026-10-20', kind: 'AUCUNE' }, NOW).data.kind, 'AUCUNE');
  assert.match(checkTerms({ validFrom: '2026-10-21', kind: 'PAR_LIVRAISON' }, NOW).error, /prix par livraison/);
  assert.match(checkTerms({ validFrom: '2026-10-21', kind: 'FORFAIT_MENSUEL', monthlyFee: 0 }, NOW).error, /forfait/);
  const { data } = checkTerms({ validFrom: '2026-11-01', kind: 'PAR_LIVRAISON', perDeliveryPrice: 500, monthlyFee: 9999, freeDeliveryPrice: 1000 }, NOW);
  assert.deepEqual({ ...data, validFrom: data.validFrom.toISOString() }, {
    validFrom: '2026-11-01T00:00:00.000Z', kind: 'PAR_LIVRAISON', perDeliveryPrice: 500, monthlyFee: null, freeDeliveryPrice: 1000, note: null,
  });
});

test('conditions : seule une version pas encore commencée se supprime ; la version d’un jour est la dernière commencée', () => {
  assert.equal(canDeleteTerms({ validFrom: d('2026-10-21') }, NOW), true);
  assert.equal(canDeleteTerms({ validFrom: d('2026-10-20') }, NOW), false); // commencée aujourd'hui
  const versions = [version('b', '2026-10-15', 'FORFAIT_MENSUEL'), version('a', '2026-10-01', 'AUCUNE')];
  assert.equal(termsOn(d('2026-09-30'), versions), null);
  assert.equal(termsOn(d('2026-10-14'), versions).id, 'a');
  assert.equal(termsOn(d('2026-10-15'), versions).id, 'b');
});

// ─── Montant dû ───

test('prix par livraison + prix fixe par livraison offerte : deux lignes séparées, expliquées (réponse 1 du client)', () => {
  const p = period('2026-10-01', '2026-10-03');
  const due = computeAmountDue({
    ...p,
    versions: [version('v', '2026-10-01', 'PAR_LIVRAISON', { perDeliveryPrice: 500, freeDeliveryPrice: 1000 })],
    deliveriesByDay: days({ '2026-10-01': { count: 2, offered: 1 }, '2026-10-03': { count: 1, offered: 0 } }),
  });
  assert.equal(due.lines.length, 2);
  const [main, offered] = due.lines;
  assert.equal(main.kind, 'PAR_LIVRAISON');
  assert.equal(main.amount, 1500); // les 3 livraisons, offertes comprises
  assert.match(main.detail, /3 livraisons × 500 F, du 1er octobre au 3 octobre/);
  assert.equal(offered.kind, 'OFFERTE');
  assert.equal(offered.amount, 1000);
  assert.match(offered.explain, /en plus/);
  assert.equal(due.total, 2500);
  assert.equal(due.incomplete, false);
});

test('forfait mensuel au prorata des jours ; jours sans conditions signalés, sans montant', () => {
  const p = period('2026-10-01', '2026-10-20');
  const due = computeAmountDue({ ...p, versions: [version('f', '2026-10-11', 'FORFAIT_MENSUEL', { monthlyFee: 31000 })], deliveriesByDay: days({}) });
  assert.deepEqual(due.lines.map((l) => [l.kind, l.from, l.to, l.amount]), [
    ['NON_REGLE', '2026-10-01', '2026-10-10', null],
    ['FORFAIT_MENSUEL', '2026-10-11', '2026-10-20', 10000], // 31 000 F × 10 jours ÷ 31
  ]);
  assert.match(due.lines[1].detail, /31 000 F × 10 jours ÷ 31 jours/);
  assert.match(due.lines[1].label, /octobre 2026/);
  assert.equal(due.total, 10000);
  assert.equal(due.incomplete, true);
});

test('forfait sur deux mois : une ligne par mois, arrondie au franc ; mois complet écrit comme tel', () => {
  const versions = [version('f', '2026-09-21', 'FORFAIT_MENSUEL', { monthlyFee: 30000 })];
  const due = computeAmountDue({ from: d('2026-09-21'), end: d('2026-10-06'), versions, deliveriesByDay: days({}) });
  assert.deepEqual(due.lines.map((l) => l.amount), [10000, 4839]); // 30 000 × 10/30 ; 30 000 × 5/31 = 4 838,7
  assert.equal(due.total, 14839);
  const full = computeAmountDue({ from: d('2026-10-01'), end: d('2026-11-01'), versions, deliveriesByDay: days({}) });
  assert.equal(full.lines[0].amount, 30000);
  assert.match(full.lines[0].detail, /mois complet/);
});

test('changement de formule en cours de période ; « rien à payer » = 0 F ; offertes sans prix = pas de ligne', () => {
  const versions = [
    version('essai', '2026-10-01', 'AUCUNE', { freeDeliveryPrice: 0 }),
    version('prix', '2026-10-03', 'PAR_LIVRAISON', { perDeliveryPrice: 400 }),
  ];
  const due = computeAmountDue({
    from: d('2026-10-01'), end: d('2026-10-05'), versions,
    deliveriesByDay: days({ '2026-10-02': { count: 4, offered: 2 }, '2026-10-04': { count: 2, offered: 1 } }),
  });
  assert.deepEqual(due.lines.map((l) => [l.kind, l.amount]), [['AUCUNE', 0], ['PAR_LIVRAISON', 800]]);
  assert.equal(due.total, 800);
});

// ─── Relevé ───

const change = (toStatus, time, extra = {}) => ({ toStatus, createdAt: at(time), fromStatus: null, reason: null, staffName: 'Agent', ...extra });
const delivered = (reference, day, extra = {}) => ({
  reference,
  status: 'LIVREE',
  itemsTotal: 99999, // ne doit jamais ressortir
  paymentMethod: 'ORANGE_MONEY',
  deliveryFee: 1000,
  deliveryNightFee: null,
  deliveryFeeMethod: 'ESPECES',
  deliveryFeeVerifiedAt: null,
  cashRemittanceId: null,
  courierId: 'c1',
  courierName: 'Issa',
  deliveryRunId: null,
  deliveryZoneName: 'Gounghin',
  statusChanges: [
    change('PAYEE', `${day}T12:00:00Z`),
    change('EN_PREPARATION', `${day}T12:00:00Z`),
    change('PRETE_LIVRAISON', `${day}T12:20:00Z`),
    change('EN_LIVRAISON', `${day}T12:30:00Z`),
    change('LIVREE', `${day}T12:50:00Z`),
  ],
  events: [],
  ...extra,
});

const ORDERS = [
  delivered('BC-A', '2026-10-10', { cashRemittanceId: 'r1' }),
  delivered('BC-B', '2026-10-10', { deliveryFeeMethod: 'MOBILE_MONEY', deliveryFee: 1500, deliveryNightFee: 500, deliveryFeeVerifiedAt: at('2026-10-10T13:00:00Z'), deliveryRunId: 'run1' }),
  delivered('BC-C', '2026-10-11', { deliveryFee: 0, deliveryFeeMethod: null, courierId: 'c2', courierName: 'Awa', events: [{ type: 'RECUPEREE_SANS_LIVREUR', createdAt: at('2026-10-11T12:30:00Z') }] }),
  delivered('BC-HORS', '2026-09-30'), // livrée avant la période
  {
    ...delivered('BC-X', '2026-10-12'),
    status: 'ANNULEE',
    statusChanges: [change('PAYEE', '2026-10-12T10:00:00Z'), change('EN_LIVRAISON', '2026-10-12T10:30:00Z'), change('ANNULEE', '2026-10-12T11:00:00Z', { fromStatus: 'EN_LIVRAISON', reason: 'Client injoignable' })],
  },
];
const RUNS = [{
  id: 'run1', createdAt: at('2026-10-10T12:10:00Z'), courierName: 'Issa', createdByName: 'Resp',
  orders: [{ status: 'LIVREE', statusChanges: ORDERS[1].statusChanges }, { status: 'LIVREE', statusChanges: [change('EN_LIVRAISON', '2026-10-10T12:35:00Z'), change('LIVREE', '2026-10-10T13:10:00Z')] }],
}];
const VERSIONS = [version('v', '2026-10-01', 'PAR_LIVRAISON', { perDeliveryPrice: 500, freeDeliveryPrice: 1000 })];
const build = (withContract) => buildStatement({
  period: period('2026-10-01', '2026-10-20'), orders: ORDERS, runs: RUNS, versions: VERSIONS, company: { companyName: 'Notre Société' }, withContract, now: NOW,
});

test('relevé : livraisons de la période (à leur date de livraison), frais par mode, offertes, annulations', () => {
  const s = build(true);
  assert.deepEqual(s.deliveries.map((x) => x.reference), ['BC-A', 'BC-B', 'BC-C']);
  assert.deepEqual(s.summary, { deliveries: 3, offered: 1, cancellations: 1, feesTotal: 2500, cash: 1000, mobile: 1500, couriers: 2, tours: 1 });
  assert.equal(s.fees.nightTotal, 500);
  assert.deepEqual(s.fees.cash, { count: 1, amount: 1000, remitted: 1000, held: 0 });
  assert.deepEqual(s.fees.mobile, { count: 1, amount: 1500, verified: 1500, toVerify: 0 });
  assert.equal(s.cancellations[0].afterPickup, true);
  assert.equal(s.cancellations[0].reason, 'Client injoignable');
  assert.equal(s.company.name, 'Notre Société');
});

test('relevé : délais moyens (payée, prête, récupérée, livrée), livreurs et tournées', () => {
  const s = build(true);
  const delay = Object.fromEntries(s.delays.map((x) => [x.key, [x.minutes, x.count]]));
  assert.deepEqual(delay, { preparation: [20, 3], wait: [10, 3], ride: [20, 3], total: [50, 3] });
  const issa = s.couriers.find((c) => c.name === 'Issa');
  assert.deepEqual([issa.deliveries, issa.cash, issa.mobile, issa.rideMinutes, issa.runs], [2, 1000, 1500, 20, 1]);
  assert.equal(s.couriers.find((c) => c.name === 'Awa').pickedUpWithoutCourier, 1);
  assert.deepEqual([s.tours[0].orders, s.tours[0].delivered, s.tours[0].durationMinutes], [2, 2, 40]); // 12:30 -> 13:10
});

test('relevé du Prestataire : montant dû selon les conditions, versions utilisées', () => {
  const s = build(true);
  assert.equal(s.amountDue.total, 3 * 500 + 1000);
  assert.deepEqual(s.contract.versions.map((v) => v.id), ['v']);
});

test('jamais les ventes de Belchicken dans le relevé (plats, total, paiement des plats)', () => {
  const json = JSON.stringify(build(true));
  for (const word of ['itemsTotal', '99999', 'ORANGE_MONEY', 'paymentMethod']) assert.ok(!json.includes(word), word);
});

// ─── Responsable livraison : jamais les conditions ni le montant dû ───

test('Responsable livraison : le relevé ne contient NI les conditions du contrat NI le montant dû', () => {
  assert.equal(seesContract('RESPONSABLE_LIVRAISON'), false);
  assert.equal(seesContract('PRESTATAIRE'), true);
  assert.equal(seesContract('PATRON'), true);
  const s = build(seesContract('RESPONSABLE_LIVRAISON'));
  assert.equal('contract' in s, false);
  assert.equal('amountDue' in s, false);
  const json = JSON.stringify(s);
  for (const word of ['amountDue', 'contract', 'perDeliveryPrice', 'freeDeliveryPrice', 'monthlyFee', 'Montant dû', 'Prix par livraison', 'Forfait']) {
    assert.ok(!json.includes(word), `« ${word} » envoyé au Responsable livraison`);
  }
  // Le travail de son équipe, lui, est bien là
  assert.equal(s.summary.deliveries, 3);
  assert.equal(s.couriers.length, 2);
  // forViewer retire aussi ces champs d'un relevé complet
  assert.equal('amountDue' in forViewer(build(true), false), false);
});

async function cellsOf(statement) {
  const wb = await statementWorkbook(statement);
  const buffer = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buffer); // le fichier se relit : il est valide
  const texts = [];
  back.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => texts.push(String(c.value?.toString?.() ?? c.value)))));
  return { names: back.worksheets.map((w) => w.name), texts, back };
}

test('Excel du Responsable livraison : ni feuille ni ligne sur les conditions ou le montant dû', async () => {
  const { names, texts } = await cellsOf(build(false));
  assert.deepEqual(names, ['Résumé', 'Livraisons', 'Par jour', 'Livreurs', 'Tournées', 'Annulations']);
  const all = texts.join('\n');
  for (const word of ['Montant dû', 'Conditions', 'conditions', 'Prix par livraison', 'Forfait', 'contrat']) assert.ok(!all.includes(word), `« ${word} » dans l'Excel du Responsable`);
  assert.ok(all.includes('BC-A'));
});

test('Excel du Prestataire : toutes les feuilles, montants en nombres, total dû', async () => {
  const { names, back } = await cellsOf(build(true));
  assert.deepEqual(names, ['Résumé', 'Montant dû', 'Conditions', 'Livraisons', 'Par jour', 'Livreurs', 'Tournées', 'Annulations']);
  const due = back.getWorksheet('Montant dû');
  const total = due.getRow(due.rowCount);
  assert.equal(total.getCell(1).value, 'Total dû');
  assert.equal(total.getCell(4).value, 2500);
  const livraisons = back.getWorksheet('Livraisons');
  assert.equal(typeof livraisons.getRow(3).getCell(5).value, 'number'); // frais (ligne 1 : note, ligne 2 : en-tête)
});

// ─── Interrupteur RELEVE ───

test('RELEVE : fermé tant que le Prestataire ne l’ouvre pas', () => {
  assert.equal(featureMap([]).RELEVE, false);
  assert.equal(featureMap([{ key: 'RELEVE', enabled: true }]).RELEVE, true);
  assert.equal(featureMap([]).CAISSE, true); // les autres restent ouvertes sans ligne
});
