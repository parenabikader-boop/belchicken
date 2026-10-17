// Compte Patron simplifié : export Excel de la page Comptes (résumé, toutes les transactions, ventes par heure et par
// jour, plats). Montants en nombres (additionnables), heures du Burkina (= UTC). Jamais le nom du client ; numéro masqué.
import ExcelJS from 'exceljs';
import { table } from './sales-excel.js';

const MONEY = '#,##0" F"';
const DATE_TIME = 'dd/mm/yyyy hh:mm';
const frDay = (key) => key.split('-').reverse().join('/');

export const accountsFileName = (a) => `comptes-${a.period.du}-au-${a.period.au}.xlsx`;

export async function accountsWorkbook(a) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Belchicken';
  const s = a.summary;
  const note = `Comptes du ${frDay(a.period.du)} au ${frDay(a.period.au)} · ventes des repas, sans les frais de livraison`;
  table(wb, 'Résumé', [
    { key: 'label', header: 'Chiffre', width: 42 },
    { key: 'value', header: 'Valeur', width: 18 },
  ], [
    { label: 'Ventes des repas (F)', value: s.revenue },
    { label: 'Commandes payées', value: s.paid },
    { label: 'Panier moyen (F)', value: s.avgBasket },
    { label: 'Livraison : commandes', value: s.delivery.count },
    { label: 'À récupérer : commandes', value: s.pickup.count },
    { label: 'Payées automatiquement', value: s.autoPaid },
    { label: 'Annulées après paiement', value: s.cancelled.afterPayment.count },
    { label: 'Annulées après paiement (F, à rembourser)', value: s.cancelled.afterPayment.amount },
    { label: 'Annulées avant paiement', value: s.cancelled.beforePayment },
    ...a.insights.map((i) => ({ label: i.text, value: null })),
  ], note);

  table(wb, 'Transactions', [
    { key: 'at', header: 'Heure du paiement', width: 18, format: DATE_TIME },
    { key: 'reference', header: 'Référence', width: 14 },
    { key: 'amount', header: 'Montant des plats', width: 16, format: MONEY },
    { key: 'method', header: 'Opérateur', width: 15 },
    { key: 'how', header: 'Validation', width: 26 },
    { key: 'phone', header: 'Numéro (masqué)', width: 16 },
    { key: 'mode', header: 'Livraison / À récupérer', width: 20 },
    { key: 'state', header: 'État', width: 24 },
  ], a.transactions.map((t) => ({
    ...t,
    at: new Date(t.at),
    how: t.auto ? 'Automatique' : `À la main${t.by ? ` (${t.by})` : ''}`,
    state: t.cancelled ? 'Annulée après paiement' : 'Vente',
  })), note);

  table(wb, 'Par heure', [
    { key: 'label', header: 'Heure', width: 14 },
    { key: 'count', header: 'Commandes payées', width: 18 },
    { key: 'revenue', header: 'Ventes', width: 16, format: MONEY },
  ], a.hours.filter((h) => h.count).map((h) => ({ ...h, label: `${h.hour} h – ${(h.hour + 1) % 24} h` })), note);

  table(wb, 'Par jour', [
    { key: 'name', header: 'Jour', width: 14 },
    { key: 'count', header: 'Commandes payées', width: 18 },
    { key: 'revenue', header: 'Ventes', width: 16, format: MONEY },
    { key: 'avgRevenue', header: 'Ventes moyennes par jour', width: 22, format: MONEY },
  ], a.days, note);

  table(wb, 'Plats', [
    { key: 'name', header: 'Plat', width: 34 },
    { key: 'quantity', header: 'Vendus', width: 12 },
    { key: 'revenue', header: 'Ventes', width: 16, format: MONEY },
  ], a.top, note);
  return wb;
}
