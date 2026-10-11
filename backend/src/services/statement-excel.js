// Lot 5d : relevé en fichier Excel (.xlsx), fabriqué à partir du relevé déjà préparé pour la personne qui le
// demande (statement.js, forViewer). Sans conditions ni montant dû dans le relevé (Responsable livraison) :
// pas de feuille « Montant dû » ni « Conditions », et aucune ligne qui en parle.
// Montants en nombres (additionnables dans Excel), heures du Burkina (= UTC).
import ExcelJS from 'exceljs';

const MONEY = '#,##0" F"';
const DATE_TIME = 'dd/mm/yyyy hh:mm';
const DATE = 'dd/mm/yyyy';
const RED = 'FFC8102E';
const CREAM = 'FFFBF3E6';

const asDate = (t) => (t ? new Date(t) : null);
const frDay = (key) => key.split('-').reverse().join('/');
const METHOD = { ESPECES: 'Espèces', MOBILE_MONEY: 'Mobile money' };

// Feuille en tableau : en-tête rouge, première ligne figée, largeurs et formats par colonne
function table(wb, name, columns, rows, note) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: note ? 2 : 1 }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 16, style: c.format ? { numFmt: c.format } : {} }));
  if (note) {
    ws.addRow([note]);
    ws.getRow(1).font = { italic: true, color: { argb: 'FF6B4A3A' } };
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

export async function statementWorkbook(s) {
  const wb = new ExcelJS.Workbook();
  wb.creator = s.company.name || 'Belchicken';
  wb.created = new Date(s.generatedAt);
  const withContract = Boolean(s.amountDue);

  // ─── Résumé ───
  const ws = wb.addWorksheet('Résumé', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 46 }, { width: 22 }, { width: 60 }];
  const title = ws.addRow([`Relevé de livraison · ${s.company.client}`]);
  title.font = { bold: true, size: 16, color: { argb: RED } };
  ws.addRow([`Livraisons faites par ${s.company.name || 'notre équipe de livraison'}`]);
  ws.addRow([`Période : du ${frDay(s.period.du)} au ${frDay(s.period.au)} (${s.period.days} jours)`]).font = { bold: true };
  const made = new Date(s.generatedAt).toISOString();
  ws.addRow([`Préparé le ${frDay(made.slice(0, 10))} à ${made.slice(11, 16)} (heure du Burkina)`]);
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
    r.getCell(3).font = { italic: true, color: { argb: 'FF6B4A3A' } };
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    return r;
  };

  section('En bref');
  line('Livraisons faites', s.summary.deliveries);
  line('dont livraisons offertes', s.summary.offered, 'Le client n’a rien payé au livreur.');
  line('Commandes annulées', s.summary.cancellations);
  line('Frais de livraison encaissés', s.fees.total, s.fees.nightTotal ? `dont ${s.fees.nightTotal.toLocaleString('fr-FR')} F de supplément de nuit` : null, MONEY);
  line('en espèces', s.fees.cash.amount, `${s.fees.cash.count} livraisons · remises : ${s.fees.cash.remitted.toLocaleString('fr-FR')} F · encore chez les livreurs : ${s.fees.cash.held.toLocaleString('fr-FR')} F`, MONEY);
  line('par mobile money', s.fees.mobile.amount, `${s.fees.mobile.count} livraisons · vérifiés : ${s.fees.mobile.verified.toLocaleString('fr-FR')} F · à vérifier : ${s.fees.mobile.toVerify.toLocaleString('fr-FR')} F`, MONEY);
  if (withContract) {
    const r = line(
      `Montant dû par ${s.company.client}`,
      s.amountDue.total,
      s.amountDue.incomplete ? 'Des jours de la période n’avaient pas de conditions : rien n’est calculé pour eux.' : 'Détail dans la feuille « Montant dû ».',
      MONEY,
    );
    r.font = { bold: true };
    r.getCell(1).fill = r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
  }
  ws.addRow([]);
  section('Délais moyens (en minutes)');
  for (const d of s.delays) line(d.label, d.minutes, `${d.help} · ${d.count} commandes comptées`);

  // ─── Montant dû et conditions (jamais pour le Responsable livraison) ───
  if (withContract) {
    const due = table(wb, 'Montant dû', [
      { header: 'Ligne', key: 'label', width: 34 },
      { header: 'Calcul', key: 'detail', width: 52 },
      { header: 'Explication', key: 'explain', width: 70 },
      { header: 'Montant', key: 'amount', width: 16, format: MONEY },
    ], s.amountDue.lines);
    const total = due.addRow(['Total dû', null, null, s.amountDue.total]);
    total.font = { bold: true };
    due.getColumn('explain').alignment = { wrapText: true, vertical: 'top' };
    table(wb, 'Conditions', [
      { header: 'À partir du', key: 'validFrom', width: 14 },
      { header: 'Conditions', key: 'text', width: 70 },
      { header: 'Remarque', key: 'note', width: 40 },
      { header: 'Réglées par', key: 'createdByName', width: 22 },
    ], s.contract.versions.map((v) => ({ ...v, validFrom: frDay(v.validFrom) })));
  }

  table(wb, 'Livraisons', [
    { header: 'Référence', key: 'reference', width: 14 },
    { header: 'Livrée le', key: 'deliveredAt', width: 18, format: DATE_TIME },
    { header: 'Quartier', key: 'zone', width: 22 },
    { header: 'Livreur', key: 'courierName', width: 20 },
    { header: 'Frais', key: 'fee', width: 12, format: MONEY },
    { header: 'dont nuit', key: 'nightFee', width: 12, format: MONEY },
    { header: 'Payés en', key: 'method', width: 15 },
    { header: 'Payée à', key: 'paidAt', width: 18, format: DATE_TIME },
    { header: 'Prête à', key: 'readyAt', width: 18, format: DATE_TIME },
    { header: 'Récupérée à', key: 'pickedUpAt', width: 18, format: DATE_TIME },
    { header: 'Préparation (min)', key: 'preparationMinutes', width: 13 },
    { header: 'Attente livreur (min)', key: 'waitMinutes', width: 13 },
    { header: 'Trajet (min)', key: 'rideMinutes', width: 11 },
    { header: 'Total (min)', key: 'totalMinutes', width: 11 },
    { header: 'Remarque', key: 'remark', width: 34 },
  ], s.deliveries.map((d) => ({
    ...d,
    deliveredAt: asDate(d.deliveredAt),
    paidAt: asDate(d.paidAt),
    readyAt: asDate(d.readyAt),
    pickedUpAt: asDate(d.pickedUpAt),
    method: d.offered ? 'Offerte' : METHOD[d.method] || 'Non précisé',
    nightFee: d.nightFee || null,
    remark: [d.pickedUpWithoutCourier && 'Récupérée confirmée à la place du livreur', d.method === 'ESPECES' && !d.cashRemitted && 'Espèces encore chez le livreur', d.method === 'MOBILE_MONEY' && !d.mobileVerified && 'Mobile money à vérifier'].filter(Boolean).join(' · ') || null,
  })), 'Heures du Burkina. Seulement les frais de livraison : aucun montant des plats.');

  table(wb, 'Par jour', [
    { header: 'Jour', key: 'day', width: 14, format: DATE },
    { header: 'Livraisons', key: 'count', width: 12 },
    { header: 'dont offertes', key: 'offered', width: 13 },
    { header: 'Frais encaissés', key: 'fees', width: 16, format: MONEY },
  ], s.days.map((d) => ({ ...d, day: new Date(`${d.day}T00:00:00Z`) })));

  table(wb, 'Livreurs', [
    { header: 'Livreur', key: 'name', width: 22 },
    { header: 'Livraisons', key: 'deliveries', width: 12 },
    { header: 'dont offertes', key: 'offered', width: 13 },
    { header: 'Espèces', key: 'cash', width: 14, format: MONEY },
    { header: 'Espèces encore sur lui', key: 'cashHeld', width: 16, format: MONEY },
    { header: 'Mobile money', key: 'mobile', width: 14, format: MONEY },
    { header: 'Attente moyenne (min)', key: 'waitMinutes', width: 14 },
    { header: 'Trajet moyen (min)', key: 'rideMinutes', width: 14 },
    { header: 'Tournées', key: 'runs', width: 10 },
    { header: 'Récupérées confirmées à sa place', key: 'pickedUpWithoutCourier', width: 18 },
  ], s.couriers);

  table(wb, 'Tournées', [
    { header: 'Confiée le', key: 'createdAt', width: 18, format: DATE_TIME },
    { header: 'Livreur', key: 'courierName', width: 22 },
    { header: 'Confiée par', key: 'createdByName', width: 22 },
    { header: 'Commandes', key: 'orders', width: 11 },
    { header: 'Livrées', key: 'delivered', width: 9 },
    { header: 'Annulées', key: 'cancelled', width: 9 },
    { header: '1re récupération', key: 'firstPickupAt', width: 18, format: DATE_TIME },
    { header: 'Dernière livraison', key: 'lastDeliveredAt', width: 18, format: DATE_TIME },
    { header: 'Durée (min)', key: 'durationMinutes', width: 11 },
  ], s.tours.map((t) => ({ ...t, createdAt: asDate(t.createdAt), firstPickupAt: asDate(t.firstPickupAt), lastDeliveredAt: asDate(t.lastDeliveredAt) })));

  table(wb, 'Annulations', [
    { header: 'Référence', key: 'reference', width: 14 },
    { header: 'Annulée le', key: 'cancelledAt', width: 18, format: DATE_TIME },
    { header: 'Étape', key: 'stageLabel', width: 34 },
    { header: 'Motif', key: 'reason', width: 40 },
    { header: 'Par', key: 'by', width: 20 },
    { header: 'Livreur', key: 'courierName', width: 20 },
    { header: 'Quartier', key: 'zone', width: 20 },
  ], s.cancellations.map((c) => ({ ...c, cancelledAt: asDate(c.cancelledAt) })));

  return wb;
}

export const statementFileName = (s) => `releve-livraison-${s.period.du}-au-${s.period.au}.xlsx`;
