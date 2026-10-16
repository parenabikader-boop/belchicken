// Plan 2 : paiement du repas validé automatiquement (interrupteur PAIEMENT_AUTO, fermé sans ligne). Accès à la base ;
// règles dans payment-sms.js (SMS du téléphone marchand) et ligdicash.js (préparé). La table AutoPayment n'est lue et
// écrite que l'interrupteur ouvert : fermé, rien ne change et rien de nouveau n'est demandé à la base.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { isFeatureOpen } from './features.service.js';
import { AUTO_PAYMENT } from './features.js';
import { getAppSettings } from './app-settings.service.js';
import { isPartnerDelivery, paymentConfirmError } from './order-status.js';
import { afterChange, notifyPartner, statusChange } from './staff-orders.service.js';
import {
  AUTO_NAME, autoReason, decide, dedupeKey, loadFormats, ORDER_AFTER_SMS_MS, ORDER_BEFORE_SMS_MS, parseSms, paymentForNewOrder,
} from './payment-sms.js';
import { callbackReference, CONFIRM_URL, CREATE_URL, invoiceBody, ligdicashHeaders, ligdicashReady, readConfirm, readCreate } from './ligdicash.js';

const LABEL = { ORANGE_MONEY: 'Orange Money', MOOV_MONEY: 'Moov Money', TELECEL_MONEY: 'Telecel Money' };
const AUTO = { id: null, name: AUTO_NAME };
const unique = (e) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const notFound = () => new AppError(404, 'Adresse inconnue.', 'INTROUVABLE');

export const autoPaymentOpen = () => isFeatureOpen(AUTO_PAYMENT);
const formats = () => loadFormats(env.autoPayment.smsFormats).formats;

// Commandes en attente qui peuvent correspondre (même opérateur, même montant, sans paiement rattaché, récentes)
const pendingOrders = (operator, amount, from, to) =>
  prisma.order.findMany({
    where: { status: 'PAIEMENT_A_VERIFIER', paymentMethod: operator, itemsTotal: amount, createdAt: { gte: from, lte: to }, autoPayment: { is: null } },
    select: { id: true, reference: true, status: true, paymentMethod: true, itemsTotal: true, paymentPayerPhone: true, createdAt: true },
  });

// ─────────── SMS du téléphone marchand ───────────

// Un SMS transmis par l'application Android. Renvoie { status } (jamais d'erreur pour un SMS sans rapport).
export async function receiveSms({ sender, text }, now = new Date()) {
  if (!(await autoPaymentOpen())) throw notFound();
  const parsed = parseSms({ sender, text }, formats());
  if (parsed.ignored) return { status: 'IGNORE' }; // expéditeur non officiel : rien n'est gardé
  const key = dedupeKey({ sender, text }, parsed);
  if (await prisma.autoPayment.findUnique({ where: { dedupeKey: key }, select: { id: true } })) return { status: 'DEJA_RECU' };

  const base = { source: 'SMS', dedupeKey: key, operator: parsed.operator, sender: String(sender).slice(0, 60), text: String(text).slice(0, 1000), receivedAt: now };
  let row;
  let decision = null;
  if (!parsed.ok) {
    row = { ...base, status: 'ILLISIBLE', detail: parsed.reason };
  } else if (parsed.supposed) {
    row = {
      ...base, amount: parsed.amount, payerPhone: parsed.phone, externalId: parsed.txid, status: 'FORMAT_A_VERIFIER',
      detail: `Format ${parsed.label} pas encore vérifié sur de vrais SMS : aucune commande n’est validée avec lui.`,
    };
  } else {
    const orders = await pendingOrders(parsed.operator, parsed.amount, new Date(now.getTime() - ORDER_BEFORE_SMS_MS), new Date(now.getTime() + ORDER_AFTER_SMS_MS));
    decision = decide(orders, { operator: parsed.operator, amount: parsed.amount, phone: parsed.phone, receivedAt: now });
    row = {
      ...base, amount: parsed.amount, payerPhone: parsed.phone, externalId: parsed.txid,
      status: decision.status === 'VALIDEE' ? 'AUCUNE' : decision.status, // rattaché seulement une fois la validation faite
      detail: decision.detail || null,
    };
  }
  let created;
  try {
    created = await prisma.autoPayment.create({ data: row });
  } catch (e) {
    if (unique(e)) return { status: 'DEJA_RECU' };
    throw e;
  }
  if (decision?.status === 'VALIDEE') return { status: await validateOrder(created.id, decision.order.id) };
  return { status: row.status };
}

// Commande qui vient d'être passée (le client a souvent payé avant d'envoyer) : un SMS déjà reçu lui correspond-il ?
// N'échoue jamais.
export function matchNewOrder(orderId) {
  (async () => {
    if (!(await autoPaymentOpen())) return;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, reference: true, status: true, paymentMethod: true, itemsTotal: true, paymentPayerPhone: true, createdAt: true },
    });
    if (!order || order.status !== 'PAIEMENT_A_VERIFIER') return;
    const payments = await prisma.autoPayment.findMany({
      where: {
        source: 'SMS', status: 'AUCUNE', orderId: null, operator: order.paymentMethod, amount: order.itemsTotal,
        receivedAt: { gte: new Date(order.createdAt.getTime() - ORDER_AFTER_SMS_MS) },
      },
    });
    if (!payments.length) return;
    const others = await pendingOrders(order.paymentMethod, order.itemsTotal, new Date(order.createdAt.getTime() - ORDER_BEFORE_SMS_MS), new Date(Date.now() + ORDER_AFTER_SMS_MS));
    const decision = paymentForNewOrder(order, payments, others);
    if (decision.status === 'VALIDEE') await validateOrder(decision.payment.id, order.id);
    else if (decision.status === 'DOUTE' && decision.payment) {
      await prisma.autoPayment.update({ where: { id: decision.payment.id }, data: { status: 'DOUTE', detail: 'Plusieurs commandes possibles (même numéro, même montant) : à vérifier par l’équipe.' } });
    }
  })().catch((e) => console.error('[paiement auto]', e));
}

// Valide la commande avec ce paiement : PAYEE (parcours court : EN_PREPARATION), noté « Paiement automatique ».
// Frais de livraison pas encore connus : le paiement est rattaché, l'équipe saisit les frais et confirme.
// Renvoie le statut du paiement (VALIDEE, FRAIS_MANQUANTS, DOUTE, AUCUNE).
export async function validateOrder(paymentId, orderId) {
  let result = 'AUCUNE';
  let done = null;
  try {
    await prisma.$transaction(async (tx) => {
      const [payment, order] = await Promise.all([
        tx.autoPayment.findUnique({ where: { id: paymentId } }),
        tx.order.findUnique({ where: { id: orderId } }),
      ]);
      if (!payment || !order) return;
      if (order.status !== 'PAIEMENT_A_VERIFIER') {
        await tx.autoPayment.update({ where: { id: paymentId }, data: { detail: `Commande ${order.reference} déjà vérifiée par l’équipe.` } });
        return;
      }
      const feeError = paymentConfirmError(order.deliveryFee, order.mode, order.deliveryFee, order.deliveryOperator);
      if (feeError) {
        await tx.autoPayment.update({ where: { id: paymentId }, data: { orderId, status: 'FRAIS_MANQUANTS', detail: 'Paiement reconnu : saisissez les frais de livraison, puis confirmez le paiement.' } });
        result = 'FRAIS_MANQUANTS';
        return;
      }
      const short = (await getAppSettings(tx)).shortFlow;
      const to = short ? 'EN_PREPARATION' : 'PAYEE';
      const updated = await tx.order.updateMany({ where: { id: orderId, status: 'PAIEMENT_A_VERIFIER' }, data: { status: to, ...(short && { shortFlow: true }) } });
      if (updated.count !== 1) return;
      await tx.orderStatusChange.create({ data: statusChange(order, 'PAYEE', AUTO, autoReason(payment, LABEL[payment.operator] || 'Ligdicash')) });
      if (short) await tx.orderStatusChange.create({ data: statusChange({ ...order, status: 'PAYEE' }, 'EN_PREPARATION', AUTO) });
      await tx.autoPayment.update({ where: { id: paymentId }, data: { orderId, status: 'VALIDEE', detail: `Commande ${order.reference} validée automatiquement.` } });
      result = 'VALIDEE';
      done = { reference: order.reference, to, partner: isPartnerDelivery(order) && !order.courierId };
    });
  } catch (e) {
    if (!unique(e)) throw e;
    // Cette commande a déjà un paiement rattaché : celui-ci reste à vérifier
    await prisma.autoPayment.update({ where: { id: paymentId }, data: { status: 'DOUTE', detail: 'La commande a déjà un paiement rattaché : à vérifier par l’équipe.' } }).catch(() => {});
    return 'DOUTE';
  }
  if (done) {
    await afterChange(done.reference).catch((e) => console.error('[paiement auto]', e));
    if (done.partner && done.to === 'EN_PREPARATION') notifyPartner(done.reference, 'EN_PREPARATION');
  }
  return result;
}

// ─────────── Page Prestataire ───────────

// Lire un SMS collé dans la page (aucune écriture, aucune validation)
export function testSms({ sender, text }) {
  const { formats: list, error } = loadFormats(env.autoPayment.smsFormats);
  const parsed = parseSms({ sender, text }, list);
  return { ...parsed, key: parsed.ignored ? null : dedupeKey({ sender, text }, parsed), formatsError: error };
}

export async function autoPaymentOverview() {
  const { formats: list, error } = loadFormats(env.autoPayment.smsFormats);
  const open = await autoPaymentOpen();
  const recent = open
    ? await prisma.autoPayment.findMany({ orderBy: { receivedAt: 'desc' }, take: 50, include: { order: { select: { reference: true } } } })
    : [];
  return {
    open,
    smsKeySet: env.autoPayment.smsKey.length >= 24,
    ligdicashSet: ligdicashReady(env.autoPayment),
    formatsError: error,
    formats: list.map((f) => ({ operator: f.operator, label: f.label, senders: f.senders, supposed: Boolean(f.supposed), example: f.example || null })),
    recent: recent.map((p) => ({
      id: p.id, source: p.source, status: p.status, operator: p.operator, amount: p.amount, payerPhone: p.payerPhone, externalId: p.externalId,
      sender: p.sender, text: p.text, detail: p.detail, reference: p.order?.reference || null, receivedAt: p.receivedAt,
    })),
  };
}

// ─────────── Ligdicash (préparé) ───────────

// Facture Ligdicash pour une commande en attente : adresse de la page de paiement. Pas encore proposé au client.
export async function createLigdicashPayment(reference, { fetchImpl = globalThis.fetch } = {}) {
  if (!(await autoPaymentOpen()) || !ligdicashReady(env.autoPayment)) throw notFound();
  const order = await prisma.order.findUnique({ where: { reference }, select: { id: true, reference: true, status: true, itemsTotal: true } });
  if (!order || order.status !== 'PAIEMENT_A_VERIFIER') throw new AppError(400, 'Cette commande n’attend pas de paiement.', 'PAIEMENT_IMPOSSIBLE');
  const res = await fetchImpl(CREATE_URL, { method: 'POST', headers: ligdicashHeaders(env.autoPayment), body: JSON.stringify(invoiceBody(order, env)) });
  const created = readCreate(await res.json().catch(() => null));
  if (created.error) throw new AppError(502, created.error, 'LIGDICASH');
  await prisma.autoPayment.create({
    data: { source: 'LIGDICASH', dedupeKey: `LIGDICASH:${created.token}`, externalId: created.token, amount: order.itemsTotal, status: 'EN_ATTENTE', orderId: order.id },
  });
  return { url: created.url };
}

// Message de Ligdicash : jamais cru tel quel. Référence -> token gardé -> « confirm » -> validation commune.
export async function ligdicashCallback(payload, { fetchImpl = globalThis.fetch } = {}) {
  if (!(await autoPaymentOpen()) || !ligdicashReady(env.autoPayment)) throw notFound();
  const reference = callbackReference(payload);
  if (!reference) return { status: 'IGNORE' };
  const order = await prisma.order.findUnique({ where: { reference }, select: { id: true, itemsTotal: true, autoPayment: true } });
  const payment = order?.autoPayment;
  if (!payment || payment.source !== 'LIGDICASH') return { status: 'IGNORE' }; // facture inconnue : peut-être une fraude
  if (payment.status !== 'EN_ATTENTE') return { status: payment.status }; // déjà traité (Ligdicash envoie deux fois)
  const res = await fetchImpl(`${CONFIRM_URL}?invoiceToken=${encodeURIComponent(payment.externalId)}`, { headers: ligdicashHeaders(env.autoPayment, false) });
  const check = readConfirm(await res.json().catch(() => null), order);
  if (!check.paid) {
    if (!check.pending) await prisma.autoPayment.update({ where: { id: payment.id }, data: { detail: check.reason } });
    return { status: 'EN_ATTENTE' };
  }
  await prisma.autoPayment.update({ where: { id: payment.id }, data: { payerPhone: check.phone, detail: check.operatorName ? `Ligdicash (${check.operatorName})` : 'Ligdicash' } });
  return { status: await validateOrder(payment.id, order.id) };
}
