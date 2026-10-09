// Lot 2 : prise de commande par l'agent. Les 3 précisions du client (8 octobre 2026) :
// 1. « Site » jamais proposé à l'agent, refusé par le serveur ;
// 2. provenance WhatsApp : « Envoyez depuis WhatsApp +226… » sur « Envoyer au client » et à toutes les étapes suivantes ;
// 3. « saisie par » et « paiement vérifié par » sur le détail et sur le bon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentChoices, agentSourceError, customerPrefill, enteredBy, paymentVerification, sendFrom, siteLockedError, sourceDeleteError,
  sourceInputSchema, sourceLabel,
} from '../src/services/order-sources.js';
import { currentMessageKey, noticeError, noticeState, renderMessage } from '../src/services/customer-messages.js';
import { toStaffOrder } from '../src/services/staff-orders.service.js';
import { newOrderNotification } from '../src/services/push.message.js';
import { agentOrderSchema, createOrderSchema } from '../src/validators/order.schema.js';

const SITE = { id: 's0', name: 'Site', kind: 'SITE', phone: null, isActive: true, position: 0 };
const APPEL = { id: 's1', name: 'Appel', kind: 'APPEL', phone: null, isActive: true, position: 1 };
const WA1 = { id: 's2', name: 'WhatsApp 05 23 48 48', kind: 'WHATSAPP', phone: '+22605234848', isActive: true, position: 2 };
const WA2 = { id: 's3', name: 'WhatsApp 50 62 70 70', kind: 'WHATSAPP', phone: '+22650627070', isActive: true, position: 3 };
const SOURCES = [WA2, SITE, WA1, APPEL];

const at = (min) => new Date(Date.UTC(2026, 9, 9, 12, min));
const ctx = { siteUrl: 'https://site', payment: { merchantName: 'ECOFOOD', codes: { ORANGE_MONEY: '*1*MONTANT#', MOOV_MONEY: '*2*MONTANT#', TELECEL_MONEY: '*3*MONTANT#' } } };

// Commande saisie par Awa depuis le WhatsApp 50 62 70 70, telle que la lit la base (DETAIL_INCLUDE)
const agentOrder = (extra = {}) => ({
  reference: 'BC-LOT2AA', status: 'PAIEMENT_A_VERIFIER', mode: 'LIVRAISON', createdAt: at(0),
  customerName: 'Moussa Ouédraogo', customerPhone: '+22670000000', paymentMethod: 'ORANGE_MONEY', paymentPayerPhone: '+22670000000',
  sourceId: WA2.id, sourceName: WA2.name, source: { kind: WA2.kind, phone: WA2.phone },
  createdById: 'u-awa', createdByName: 'Awa (essai)',
  itemsTotal: 8000, deliveryFee: null, deliveryFeeSource: 'A_CONFIRMER', addressNote: 'Kamsonghin, près du marché',
  items: [{ productName: 'Menu N° 1', quantity: 2, unitPrice: 4000, lineTotal: 8000, drinks: [] }],
  statusChanges: [{ fromStatus: null, toStatus: 'PAIEMENT_A_VERIFIER', staffName: 'Awa (essai)', createdAt: at(0) }],
  events: [],
  ...extra,
});
// Commande passée par le client sur le site : aucune provenance, aucun agent
const siteOrder = (extra = {}) => agentOrder({ sourceId: null, sourceName: null, source: null, createdById: null, createdByName: null, ...extra });

// L'historique d'une commande menée jusqu'à « statut », chaque étape confirmée (« Oui, envoyé »)
const STEPS = ['PAYEE', 'EN_PREPARATION', 'EN_LIVRAISON', 'LIVREE'];
function walk(until, base = agentOrder) {
  const statusChanges = [{ fromStatus: null, toStatus: 'PAIEMENT_A_VERIFIER', staffName: 'Awa (essai)', createdAt: at(0) }];
  const events = [];
  let from = 'PAIEMENT_A_VERIFIER';
  for (const [i, s] of STEPS.entries()) {
    statusChanges.push({ fromStatus: from, toStatus: s, staffName: s === 'PAYEE' ? 'Ali (opérateur)' : 'Awa (essai)', createdAt: at(10 * (i + 1)) });
    from = s;
    if (s === until) break;
  }
  return base({ status: until, statusChanges, events, deliveryFee: 750, deliveryFeeSource: 'AGENT', courierName: 'Issa', courierId: 'c1', deliveryCode: '1234', ...(until === 'LIVREE' && { deliveryFeeMethod: 'ESPECES' }) });
}

// ─────────── Précision 1 : « Site » jamais proposé à l'agent, refusé par le serveur ───────────

test('précision 1 : la liste de l’agent ne contient jamais « Site », dans l’ordre du Patron', () => {
  const choices = agentChoices(SOURCES);
  assert.deepEqual(choices.map((s) => s.name), ['Appel', 'WhatsApp 05 23 48 48', 'WhatsApp 50 62 70 70']);
  assert.ok(choices.every((s) => s.kind !== 'SITE'));
  // Une provenance désactivée n'est plus proposée
  assert.deepEqual(agentChoices([...SOURCES.filter((s) => s !== APPEL), { ...APPEL, isActive: false }]).map((s) => s.name), ['WhatsApp 05 23 48 48', 'WhatsApp 50 62 70 70']);
});

test('précision 1 : le serveur refuse « Site », une provenance inconnue ou désactivée', () => {
  assert.match(agentSourceError(SITE), /« Site » est réservée aux commandes passées par le client sur le site/);
  assert.match(agentSourceError(null), /Provenance inconnue/);
  assert.match(agentSourceError({ ...WA1, isActive: false }), /n’est plus proposée/);
  assert.equal(agentSourceError(APPEL), null);
  assert.equal(agentSourceError(WA2), null);
});

test('précision 1 : le Patron ne peut ni créer, ni modifier, ni supprimer « Site »', () => {
  // Le type SITE n'est pas proposé à la création
  assert.equal(sourceInputSchema.safeParse({ name: 'Site bis', kind: 'SITE' }).success, false);
  assert.match(siteLockedError(SITE), /« Site » est fixe/);
  assert.match(sourceDeleteError(SITE, 0), /« Site » est fixe/);
  assert.equal(siteLockedError(APPEL), null);
  // Une provenance déjà utilisée se désactive au lieu de se supprimer
  assert.match(sourceDeleteError(APPEL, 3), /a déjà servi pour 3 commandes : désactivez-la plutôt/);
  assert.equal(sourceDeleteError(APPEL, 0), null);
  // WhatsApp : le numéro d'envoi est obligatoire ; pas de numéro pour un appel
  assert.equal(sourceInputSchema.safeParse({ name: 'WhatsApp 3', kind: 'WHATSAPP' }).success, false);
  assert.equal(sourceInputSchema.parse({ name: 'WhatsApp 3', kind: 'WHATSAPP', phone: '50 62 70 70' }).phone, '+22650627070');
  assert.equal(sourceInputSchema.parse({ name: 'Appel 2', kind: 'APPEL', phone: '50 62 70 70' }).phone, null);
});

test('précision 1 : une commande d’agent demande une provenance ; le site reste comme avant', () => {
  const body = {
    customer: { name: 'Moussa', phone: '70 00 00 00' },
    payment: { method: 'ORANGE_MONEY', payerPhone: '70 00 00 00' },
    addressNote: 'Kamsonghin, près du marché',
    items: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
  };
  assert.equal(agentOrderSchema.safeParse(body).success, false);
  assert.equal(agentOrderSchema.parse({ ...body, sourceId: WA2.id }).sourceId, WA2.id);
  // Le site n'envoie pas de provenance, et n'en a pas besoin
  const site = createOrderSchema.parse({ ...body, sourceId: SITE.id });
  assert.equal(site.sourceId, undefined);
});

// ─────────── Précision 2 : « Envoyez depuis WhatsApp +226… » à chaque étape ───────────

test('précision 2 : provenance WhatsApp, le numéro d’envoi est donné', () => {
  assert.deepEqual(sendFrom(agentOrder()), { phone: '+226 50 62 70 70', text: 'Envoyez depuis WhatsApp +226 50 62 70 70' });
  assert.equal(sendFrom(agentOrder({ source: { kind: 'WHATSAPP', phone: WA1.phone } })).text, 'Envoyez depuis WhatsApp +226 05 23 48 48');
  // Appel et site : rien à préciser
  assert.equal(sendFrom(agentOrder({ source: { kind: 'APPEL', phone: null } })), null);
  assert.equal(sendFrom(siteOrder()), null);
});

test('précision 2 : « Envoyer au client » de la commande à payer porte le numéro d’envoi, sans bloquer', () => {
  const o = toStaffOrder(agentOrder());
  assert.equal(o.sendFrom.text, 'Envoyez depuis WhatsApp +226 50 62 70 70');
  assert.equal(o.notice.key, 'COMMANDE_A_PAYER');
  assert.equal(o.notice.sendFrom.text, 'Envoyez depuis WhatsApp +226 50 62 70 70');
  // Message facultatif : l'agent donne souvent le code de vive voix
  assert.equal(o.notice.optional, true);
  assert.equal(o.notice.required, false);
  assert.equal(noticeError(agentOrder(), 'PAYEE'), null);
  // Le lien WhatsApp va au client, avec le total et les codes marchands remplis
  assert.match(o.notice.url, /^https:\/\/wa\.me\/22670000000\?text=/);
  const text = renderMessage('COMMANDE_A_PAYER', agentOrder(), ctx);
  assert.match(text, /Total à payer : 8 000 F/);
  assert.match(text, /\*1\*8000#/);
  assert.doesNotMatch(text, /\{\{\d+\}\}/);
});

test('précision 2 : le numéro d’envoi reste à toutes les étapes suivantes, jusqu’au remerciement et à l’annulation', () => {
  for (const step of STEPS) {
    const o = toStaffOrder(walk(step));
    assert.ok(o.notice, `message attendu à l’étape ${step}`);
    assert.equal(o.notice.sendFrom?.text, 'Envoyez depuis WhatsApp +226 50 62 70 70', `étape ${step}`);
    assert.equal(o.sendFrom?.text, 'Envoyez depuis WhatsApp +226 50 62 70 70', `étape ${step}`);
  }
  const cancelled = agentOrder({ status: 'ANNULEE', statusChanges: [...agentOrder().statusChanges, { fromStatus: 'PAIEMENT_A_VERIFIER', toStatus: 'ANNULEE', reason: 'Client injoignable', staffName: 'Awa (essai)', createdAt: at(5) }] });
  assert.equal(toStaffOrder(cancelled).notice.sendFrom.text, 'Envoyez depuis WhatsApp +226 50 62 70 70');
  // À emporter aussi
  const pickup = toStaffOrder(agentOrder({ mode: 'A_EMPORTER' }));
  assert.equal(pickup.notice.key, 'COMMANDE_A_PAYER_EMPORTER');
  assert.equal(pickup.notice.sendFrom.text, 'Envoyez depuis WhatsApp +226 50 62 70 70');
});

test('précision 2 : commande du site, rien ne change (pas de message à « à vérifier », pas de numéro)', () => {
  const o = toStaffOrder(siteOrder());
  assert.equal(o.notice, null);
  assert.equal(o.sendFrom, null);
  assert.equal(currentMessageKey(siteOrder()), null);
  const paid = toStaffOrder(walk('PAYEE', siteOrder));
  assert.equal(paid.notice.sendFrom, null);
  // L'étape suivante reste bloquée tant que l'envoi n'est pas confirmé, comme avant
  assert.equal(noticeState(walk('PAYEE', siteOrder)).required, true);
});

// ─────────── Précision 3 : « saisie par » et « paiement vérifié par » ───────────

test('précision 3 : le détail donne la provenance, « saisie par » et « paiement vérifié par »', () => {
  const before = toStaffOrder(agentOrder());
  assert.equal(before.source, 'WhatsApp 50 62 70 70');
  assert.equal(before.enteredBy, 'Awa (essai)');
  assert.equal(before.paymentVerified, null); // pas encore vérifié
  const paid = toStaffOrder(walk('EN_LIVRAISON'));
  assert.deepEqual(paid.paymentVerified, { by: 'Ali (opérateur)', at: at(10) });
  assert.equal(paid.enteredBy, 'Awa (essai)');
});

test('précision 3 : parcours court, « paiement vérifié par » vient de la ligne « Payée »', () => {
  const o = agentOrder({
    status: 'EN_PREPARATION', shortFlow: true,
    statusChanges: [
      { toStatus: 'PAIEMENT_A_VERIFIER', staffName: 'Awa (essai)', createdAt: at(0) },
      { toStatus: 'PAYEE', staffName: 'Ali (opérateur)', createdAt: at(5) },
      { toStatus: 'EN_PREPARATION', staffName: 'Ali (opérateur)', createdAt: at(5) },
    ],
  });
  assert.deepEqual(paymentVerification(o), { by: 'Ali (opérateur)', at: at(5) });
});

test('précision 3 : commande du site, provenance « Site » et pas d’agent', () => {
  const o = toStaffOrder(walk('PAYEE', siteOrder));
  assert.equal(o.source, 'Site');
  assert.equal(o.enteredBy, null);
  assert.equal(o.paymentVerified.by, 'Ali (opérateur)');
  assert.equal(sourceLabel({}), 'Site');
  assert.equal(enteredBy({}), null);
});

// ─────────── Autour : alerte équipe et client retrouvé ───────────

test('alerte équipe : provenance et agent pour une commande saisie, rien de plus pour le site', () => {
  const agent = newOrderNotification(agentOrder());
  assert.match(agent.body, /WhatsApp 50 62 70 70, saisie par Awa \(essai\)/);
  assert.doesNotMatch(newOrderNotification(siteOrder()).body, /saisie par/);
});

test('client retrouvé : nom de la dernière commande, quartier et repères de la dernière livraison', () => {
  assert.equal(customerPrefill([], 0), null);
  const orders = [
    { customerName: 'Moussa O.', mode: 'A_EMPORTER', addressNote: null, deliveryZoneId: null, deliveryZoneName: null, createdAt: at(30) },
    { customerName: 'Moussa', mode: 'LIVRAISON', addressNote: 'Près du marché', deliveryZoneId: 'z1', deliveryZoneName: 'Kamsonghin', createdAt: at(10) },
  ];
  const found = customerPrefill(orders, 2, new Set(['z1']));
  assert.equal(found.name, 'Moussa O.');
  assert.equal(found.addressNote, 'Près du marché');
  assert.deepEqual(found.zone, { id: 'z1', name: 'Kamsonghin' });
  assert.equal(found.ordersCount, 2);
  // Quartier retiré de la grille : pas repris
  assert.equal(customerPrefill(orders, 2, new Set()).zone, null);
});
