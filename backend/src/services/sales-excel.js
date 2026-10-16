// Lot 6 : ventes en fichier Excel (.xlsx), fabriqué à partir des ventes déjà calculées (sales.js, avec le
// détail des commandes). Montants en nombres (additionnables dans Excel), heures du Burkina (= UTC).
// Jamais le nom ni le téléphone du client.
import ExcelJS from 'exceljs';
import { minutesText } from './sales.js';

const MONEY = '#,##0" F"';
const DATE_TIME = 'dd/mm/yyyy hh:mm';
const RED = 'FFC8102E';
const MUTED = 'FF6B4A3A';

const asDate = (t) => (t ? new Date(t) : null);
const frDay = (key) => key.split('-').reverse().join('/');
const money = (n) => `${Math.round(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const methodOf = (row, method) => row.payments.find((p) => p.method === method) || { count: 0, amount: 0 };

// Feuille en tableau : en-tête rouge, première ligne figée, largeurs et formats par colonne
function table(wb, name, columns, rows, note) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: note ? 2 : 1 }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 16, style: c.format ? { numFmt: c.format } : {} }));
  if (note) {
    ws.addRow([note]);
    ws.getRow(1).font = { italic: true, color: { argb: MUTED } };
  }
  const head = ws.addRow(columns.map((c) => c.header));
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  });
  for (const r of rows) ws.addRow(columns.map((c) => r[c.key] ?? null));
  if (!rows.length) ws.addRow(['Aucune ligne pour cette période.']);
  return ws;
}

// Colonnes communes : ventes, chiffre d'affaires, et chaque mode de paiement (nombre et montant)
function salesColumns(s) {
  const methods = [...new Set([...s.payments.map((p) => p.method)])];
  return {
    columns: [
      { header: 'Ventes', key: 'orders', width: 9 },
      { header: 'Chiffre d’affaires (plats)', key: 'revenue', width: 18, format: MONEY },
      { header: 'Panier moyen', key: 'avgBasket', width: 13, format: MONEY },
      ...methods.flatMap((m) => {
        const label = s.payments.find((p) => p.method === m).label;
        return [
          { header: `${label} (nombre)`, key: `${m}_count`, width: 12 },
          { header: `${label} (montant)`, key: `${m}_amount`, width: 14, format: MONEY },
        ];
      }),
      { header: 'Annulées', key: 'cancelledCount', width: 10 },
      { header: 'Montant annulé (hors ventes)', key: 'cancelledAmount', width: 16, format: MONEY },
    ],
    flat: (row) => ({
      ...row,
      cancelledCount: row.cancelled.count,
      cancelledAmount: row.cancelled.amount,
      ...Object.fromEntries(methods.flatMap((m) => [[`${m}_count`, methodOf(row, m).count], [`${m}_amount`, methodOf(row, m).amount]])),
    }),
  };
}

export async function salesWorkbook(s) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Belchicken';
  wb.created = new Date(s.generatedAt);

  // ─── Résumé ───
  const ws = wb.addWorksheet('Résumé', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 44 }, { width: 20 }, { width: 62 }];
  const title = ws.addRow(['Ventes · Belchicken Burkina']);
  title.font = { bold: true, size: 16, color: { argb: RED } };
  ws.addRow([`Période : du ${frDay(s.period.du)} au ${frDay(s.period.au)} (${s.period.days} jour${s.period.days > 1 ? 's' : ''})`]).font = { bold: true };
  const made = new Date(s.generatedAt).toISOString();
  ws.addRow([`Préparé le ${frDay(made.slice(0, 10))} à ${made.slice(11, 16)} (heure du Burkina). Une commande compte le jour où elle a été passée.`]);
  ws.addRow([]);

  const section = (text) => {
    const r = ws.addRow([text]);
    r.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col <= 3) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    });
  };
  const line = (label, value, help, format) => {
    const r = ws.addRow([label, value, help || null]);
    if (format) r.getCell(2).numFmt = format;
    r.getCell(3).font = { italic: true, color: { argb: MUTED } };
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  };

  section('Ventes');
  line('Commandes vendues', s.summary.orders, 'Commandes dont le paiement a été vérifié (annulées non comprises).');
  line('Chiffre d’affaires des plats', s.summary.revenue, 'Total des plats seulement : jamais les frais de livraison.', MONEY);
  line('Panier moyen', s.summary.avgBasket, null, MONEY);
  for (const p of s.payments) line(p.label, p.amount, `${p.count} commande${p.count > 1 ? 's' : ''}`, MONEY);
  for (const m of s.modes) line(m.label, m.amount, `${m.count} commande${m.count > 1 ? 's' : ''}`, MONEY);
  ws.addRow([]);
  section('Hors ventes');
  line('Commandes annulées', s.summary.cancelled.count, `Montant des plats : ${money(s.summary.cancelled.amount)}. Jamais dans le chiffre d’affaires.`);
  line('Paiement encore à vérifier', s.summary.pending.count, `Montant des plats : ${money(s.summary.pending.amount)}. Compté dès que le paiement est vérifié.`);
  line('Frais de livraison du restaurant', s.restaurantFees.amount, `${s.restaurantFees.count} livraisons · espèces ${money(s.restaurantFees.cash.amount)} · mobile money ${money(s.restaurantFees.mobile.amount)}. Payés au livreur, hors ventes. Les frais de notre partenaire de livraison ne sont jamais comptés ici.`, MONEY);
  ws.addRow([]);
  section('Vérification des paiements');
  line('Délai moyen', minutesText(s.verification.avgMinutes), `${s.verification.count} paiements vérifiés, de l’arrivée de la commande au passage à « Payée ».`);
  line('Commandes du site', minutesText(s.verification.siteAvgMinutes), `${s.verification.siteCount} paiements vérifiés`);
  line('Commandes saisies par un agent', minutesText(s.verification.agentAvgMinutes), `${s.verification.agentCount} paiements vérifiés`);

  // ─── Tableaux ───
  const { columns, flat } = salesColumns(s);
  table(wb, 'Par provenance', [
    { header: 'Provenance', key: 'name', width: 30 },
    ...columns,
    { header: 'Paiement à vérifier', key: 'pendingCount', width: 12 },
  ], s.sources.map((r) => ({ ...flat(r), name: r.isActive ? r.name : `${r.name} (désactivée)`, pendingCount: r.pending.count })));

  table(wb, 'Agents – saisies', [
    { header: 'Agent', key: 'name', width: 24 },
    ...columns,
    { header: 'Paiement à vérifier', key: 'pendingCount', width: 12 },
  ], s.enteredBy.map((r) => ({ ...flat(r), pendingCount: r.pending.count })), 'Commandes saisies par l’agent (appel, WhatsApp…). Les commandes passées par le client sur le site n’y sont pas.');

  table(wb, 'Agents – vérifications', [
    { header: 'Agent', key: 'name', width: 24 },
    { header: 'Paiements vérifiés', key: 'verified', width: 11 },
    ...columns,
    { header: 'Délai moyen (min)', key: 'avgMinutes', width: 12 },
    { header: 'Délai moyen, commandes du site (min)', key: 'siteAvgMinutes', width: 16 },
    { header: 'Délai le plus long (min)', key: 'maxMinutes', width: 13 },
  ], s.verifiedBy.map((r) => ({ ...flat(r), ...r.delay })), 'Commandes dont l’agent a vérifié le paiement (passage à « Payée »). Ventes = sans celles annulées ensuite. Délai : de l’arrivée de la commande au passage à « Payée ».');

  table(wb, 'Annulées', [
    { header: 'Référence', key: 'reference', width: 14 },
    { header: 'Passée le', key: 'createdAt', width: 18, format: DATE_TIME },
    { header: 'Annulée le', key: 'cancelledAt', width: 18, format: DATE_TIME },
    { header: 'Étape', key: 'stage', width: 22 },
    { header: 'Motif', key: 'reason', width: 40 },
    { header: 'Par', key: 'by', width: 20 },
    { header: 'Montant des plats', key: 'amount', width: 14, format: MONEY },
    { header: 'Paiement', key: 'paymentMethod', width: 16 },
    { header: 'Paiement vérifié avant', key: 'verified', width: 12 },
    { header: 'Provenance', key: 'source', width: 26 },
    { header: 'Saisie par', key: 'enteredBy', width: 20 },
  ], s.cancellations.map((c) => ({ ...c, createdAt: asDate(c.createdAt), cancelledAt: asDate(c.cancelledAt), verified: c.paymentWasVerified ? 'Oui' : 'Non' })), 'Jamais dans le chiffre d’affaires.');

  table(wb, 'Commandes', [
    { header: 'Référence', key: 'reference', width: 14 },
    { header: 'Passée le', key: 'createdAt', width: 18, format: DATE_TIME },
    { header: 'Comptée', key: 'counted', width: 18 },
    { header: 'Statut', key: 'status', width: 20 },
    { header: 'Livraison / à récupérer', key: 'mode', width: 14 },
    { header: 'Provenance', key: 'source', width: 26 },
    { header: 'Saisie par', key: 'enteredBy', width: 20 },
    { header: 'Paiement vérifié par', key: 'verifiedBy', width: 20 },
    { header: 'Vérifié le', key: 'verifiedAt', width: 18, format: DATE_TIME },
    { header: 'Délai de vérification (min)', key: 'verifyMinutes', width: 14 },
    { header: 'Paiement', key: 'paymentMethod', width: 16 },
    { header: 'Montant des plats', key: 'amount', width: 14, format: MONEY },
  ], (s.orders || []).map((o) => ({ ...o, createdAt: asDate(o.createdAt), verifiedAt: asDate(o.verifiedAt) })), 'Toutes les commandes de la période, sans le nom ni le téléphone du client.');

  return wb;
}

export const salesFileName = (s) => `ventes-${s.period.du}-au-${s.period.au}.xlsx`;
