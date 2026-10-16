// Plan 2, solution B : paiement du repas validé grâce aux SMS du téléphone marchand ECOFOOD (interrupteur
// PAIEMENT_AUTO_SMS, fermé sans ligne ; formats d'essai : interrupteur PAIEMENT_SMS_ESSAI). Règles sans base de données, testées dans test/paiement-auto.test.js. Accès à la base :
// auto-payment.service.js. Formats des SMS (données) : payment-sms-formats.js ou la variable SMS_PAIEMENT_FORMATS.
//
// Rapprochement, sans rien demander de plus au client : numéro qui a payé (saisi à la commande) + montant exact des
// plats + même opérateur + commande « paiement à vérifier » récente. Une seule commande possible : validée. Aucune, ou
// plusieurs : la commande reste à vérifier par le call center, comme avant. Un SMS ne valide qu'une commande, une fois.
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';
import { DEFAULT_SMS_FORMATS } from './payment-sms-formats.js';

export const OPERATORS = ['ORANGE_MONEY', 'MOOV_MONEY', 'TELECEL_MONEY'];
// Commande passée au plus 3 h avant le SMS, ou au plus 30 min après (le client paie souvent avant d'envoyer)
export const ORDER_BEFORE_SMS_MS = 3 * 60 * 60 * 1000;
export const ORDER_AFTER_SMS_MS = 30 * 60 * 1000;
export const AUTO_NAME = 'Paiement automatique';

// ─────────── Formats ───────────

const formatSchema = z.object({
  operator: z.enum(OPERATORS),
  label: z.string().min(1).max(40),
  supposed: z.boolean().optional(),
  trial: z.boolean().optional(),
  senders: z.array(z.string().min(1).max(40)).min(1),
  must: z.string().min(1),
  reject: z.string().optional(),
  amount: z.string().min(1),
  phone: z.string().min(1),
  txid: z.string().optional(),
  example: z.string().optional(),
});

// Expression d'un format (insensible aux majuscules), ou null si elle est mal écrite
const regex = (source) => {
  try {
    return new RegExp(source, 'iu');
  } catch {
    return null;
  }
};

// Formats utilisés : la variable SMS_PAIEMENT_FORMATS (JSON) si elle est valide, sinon le fichier. { formats, error }
export function loadFormats(json = '') {
  if (!json.trim()) return { formats: DEFAULT_SMS_FORMATS, error: null };
  try {
    const list = z.array(formatSchema).min(1).parse(JSON.parse(json));
    const bad = list.find((f) => [f.must, f.amount, f.phone, f.reject, f.txid].some((s) => s && !regex(s)));
    if (bad) return { formats: DEFAULT_SMS_FORMATS, error: `Expression invalide dans le format ${bad.label}.` };
    return { formats: list, error: null };
  } catch {
    return { formats: DEFAULT_SMS_FORMATS, error: 'SMS_PAIEMENT_FORMATS illisible : formats du fichier utilisés.' };
  }
}

// « Orange Money », « ORANGE-MONEY », « orangemoney » -> « orangemoney »
export const senderKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Formats d'un expéditeur officiel, dans l'ordre (vide : tout autre expéditeur est ignoré). Formats d'essai seulement
// avec trial (interrupteur « Formats SMS d'essai » ouvert).
export const formatsForSender = (formats, sender, { trial = false } = {}) =>
  formats.filter((f) => (trial || !f.trial) && f.senders.some((s) => senderKey(s) === senderKey(sender)));
export const formatForSender = (formats, sender, opts) => formatsForSender(formats, sender, opts)[0] || null;

// « 7 000 », « 7.000 », « 7,000 », « 7000.00 », « 7 000,50 » -> 7000 (francs entiers ; null si illisible)
export function parseAmount(text) {
  let s = String(text || '').replace(/[\s  ]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  s = s.replace(/[.,]\d{1,2}$/, ''); // centimes
  const n = Number(s.replace(/[.,]/g, ''));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const first = (source, text) => (source ? regex(source)?.exec(text)?.[1] ?? null : null);

// Lit un SMS. Renvoie :
//   { ignored: true }                         expéditeur non officiel (rien n'est gardé) ;
//   { operator, label, ok: false, reason }    expéditeur officiel, mais pas un paiement reçu lisible ;
//   { operator, label, ok: true, amount, phone, txid, supposed, trial }   paiement reçu.
// Plusieurs formats pour le même expéditeur : le premier qui y voit un paiement reçu (sinon, la raison du premier).
// trial : formats d'essai acceptés (interrupteur « Formats SMS d'essai » ouvert).
export function parseSms({ sender, text }, formats = DEFAULT_SMS_FORMATS, { trial = false } = {}) {
  const list = formatsForSender(formats, sender, { trial });
  if (!list.length) return { ignored: true };
  const body = String(text || '').replace(/\s+/g, ' ').trim();
  const fits = (f) => !(f.reject && regex(f.reject)?.test(body)) && regex(f.must)?.test(body);
  return readWith(list.find(fits) || list[0], body);
}

function readWith(format, body) {
  const base = { operator: format.operator, label: format.label, supposed: Boolean(format.supposed), trial: Boolean(format.trial) };
  if (format.reject && regex(format.reject)?.test(body)) return { ...base, ok: false, reason: 'Pas un paiement reçu (envoi, retrait ou échec).' };
  if (!regex(format.must)?.test(body)) return { ...base, ok: false, reason: 'Pas un paiement reçu.' };
  const amount = parseAmount(first(format.amount, body));
  const phone = normalizePhone(first(format.phone, body) || '');
  if (!amount) return { ...base, ok: false, reason: 'Montant introuvable dans le SMS.' };
  if (!phone) return { ...base, ok: false, reason: 'Numéro qui a payé introuvable dans le SMS.' };
  const txid = first(format.txid, body)?.toUpperCase().replace(/[.\-]+$/, '') || null;
  return { ...base, ok: true, amount, phone, txid };
}

// Un SMS = une seule fois : n° de transaction de l'opérateur, sinon empreinte de l'expéditeur et du texte
export function dedupeKey({ sender, text }, parsed) {
  if (parsed?.ok && parsed.txid) return `SMS:${parsed.operator}:${parsed.txid}`;
  return `SMS:H:${createHash('sha256').update(`${senderKey(sender)}|${String(text || '').replace(/\s+/g, ' ').trim()}`).digest('hex')}`;
}

// ─────────── Rapprochement ───────────

const time = (d) => new Date(d).getTime();

// La commande peut-elle être celle de ce paiement ? (paiement : { operator, amount, phone, receivedAt })
export function orderMatches(order, payment) {
  if (order.status !== 'PAIEMENT_A_VERIFIER' || order.paymentMethod !== payment.operator) return false;
  if (order.itemsTotal !== payment.amount) return false;
  if (normalizePhone(order.paymentPayerPhone || '') !== payment.phone) return false;
  const gap = time(order.createdAt) - time(payment.receivedAt); // < 0 : commande passée avant le SMS
  return gap >= -ORDER_BEFORE_SMS_MS && gap <= ORDER_AFTER_SMS_MS;
}

// Décision : une seule commande possible -> { status: 'VALIDEE', order } ; aucune -> 'AUCUNE' ; plusieurs -> 'DOUTE'
export function decide(orders, payment) {
  const found = orders.filter((o) => orderMatches(o, payment));
  if (found.length === 1) return { status: 'VALIDEE', order: found[0] };
  if (found.length === 0) return { status: 'AUCUNE', detail: 'Aucune commande en attente avec ce numéro et ce montant (peut-être pas encore passée).' };
  return { status: 'DOUTE', detail: `${found.length} commandes possibles (même numéro, même montant) : à vérifier par l’équipe.`, references: found.map((o) => o.reference) };
}

// Commande qui vient d'être passée : parmi les paiements reçus non rattachés, celui qui lui correspond (un seul),
// à condition qu'il ne corresponde à aucune autre commande en attente (sinon : doute, l'équipe vérifie)
export function paymentForNewOrder(order, payments, otherOrders) {
  const found = payments.filter((p) => !p.orderId && p.status === 'AUCUNE' && orderMatches(order, { operator: p.operator, amount: p.amount, phone: p.payerPhone, receivedAt: p.receivedAt }));
  if (found.length !== 1) return found.length ? { status: 'DOUTE' } : { status: 'AUCUNE' };
  const p = found[0];
  const rivals = otherOrders.filter((o) => o.id !== order.id && orderMatches(o, { operator: p.operator, amount: p.amount, phone: p.payerPhone, receivedAt: p.receivedAt }));
  return rivals.length ? { status: 'DOUTE', payment: p } : { status: 'VALIDEE', payment: p };
}

// Motif écrit dans l'historique de la commande
export const autoReason = (p, label) =>
  `${label || 'Mobile money'} : ${p.amount.toLocaleString('fr-FR')} F reçus du ${p.payerPhone || p.phone}${p.externalId || p.txid ? `, transaction ${p.externalId || p.txid}` : ''} (vérifié automatiquement)`;

// ─────────── Adresse des SMS ───────────

// Clé de l'application Android : en-tête X-Cle-Sms (ou Authorization: Bearer …, ou ?cle=…), comparée à temps constant
export function smsKeyMatches(given, expected) {
  if (!expected || expected.length < 24 || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Ce que l'application envoie (champs acceptés sous plusieurs noms, selon l'application)
export const smsBodySchema = z
  .object({
    from: z.string().max(60).optional(),
    sender: z.string().max(60).optional(),
    text: z.string().max(1000).optional(),
    message: z.string().max(1000).optional(),
    body: z.string().max(1000).optional(),
  })
  .passthrough()
  .transform((b) => ({ sender: b.from ?? b.sender ?? '', text: b.text ?? b.message ?? b.body ?? '' }))
  .refine((b) => b.sender && b.text, { message: 'Expéditeur et texte du SMS obligatoires.' });
