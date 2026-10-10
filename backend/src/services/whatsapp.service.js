import { customerAutoEnabled, env, whatsappEnabled } from '../config/env.js';
import { messageContextFor } from './delivery-mode.service.js';
import { prisma } from '../lib/prisma.js';
import { buildNewOrderParams } from './whatsapp.message.js';
import { currentMessageKey, messageModel, messageParams } from './customer-messages.js';

async function sendTemplate(to, templateName, params) {
  const { apiVersion, phoneNumberId, token, templateLang } = env.whatsapp;
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data?.messages?.[0]?.id ?? null;
}

// Alerte l'équipe d'une nouvelle commande. Ne lève jamais d'erreur :
// un échec d'envoi ne doit pas faire échouer la commande, il est journalisé.
export async function notifyTeamNewOrder(order) {
  const template = env.whatsapp.templateNewOrder;

  if (!whatsappEnabled()) {
    console.warn(`[whatsapp] non configuré, alerte ignorée pour ${order.reference}`);
    await prisma.notificationLog
      .create({ data: { orderId: order.id, recipient: '-', template, status: 'IGNOREE' } })
      .catch(() => {});
    return;
  }

  const params = buildNewOrderParams(order);
  await Promise.all(
    env.whatsapp.teamNumbers.map(async (to) => {
      try {
        const id = await sendTemplate(to, template, params);
        await prisma.notificationLog.create({
          data: { orderId: order.id, recipient: to, template, status: 'ENVOYEE', providerMessageId: id },
        });
      } catch (err) {
        console.error(`[whatsapp] échec vers ${to} pour ${order.reference} :`, err.message);
        await prisma.notificationLog
          .create({ data: { orderId: order.id, recipient: to, template, status: 'ECHEC', error: err.message.slice(0, 500) } })
          .catch(() => {});
      }
    }),
  );
}

// Message au client de l'étape où en est la commande, envoyé par l'API (modèles de customer-messages.js).
// Éteint tant que WHATSAPP_CUSTOMER_AUTO n'est pas à 1 : les agents envoient alors eux-mêmes le message
// depuis le détail de la commande (lien wa.me). Chaque message ne part qu'une fois par commande
// (journal NotificationLog, template = nom du modèle). Ne lève jamais d'erreur.
// `order` : la commande avec deliveryFee et cancelReason.
export async function autoNotifyCustomer(order) {
  if (!customerAutoEnabled()) return;
  const current = currentMessageKey(order);
  if (!current || current.missing) return;
  const { template } = messageModel(current.key, order);
  try {
    const already = await prisma.notificationLog.findFirst({ where: { orderId: order.id, template, status: 'ENVOYEE' } });
    if (already) return;
    const id = await sendTemplate(order.customerPhone, template, messageParams(current.key, order, await messageContextFor(order)));
    await prisma.notificationLog.create({
      data: { orderId: order.id, recipient: order.customerPhone, template, status: 'ENVOYEE', providerMessageId: id },
    });
  } catch (err) {
    console.error(`[whatsapp] message client ${template} non envoyé pour ${order.reference} :`, err.message);
    await prisma.notificationLog
      .create({ data: { orderId: order.id, recipient: order.customerPhone, template, status: 'ECHEC', error: err.message.slice(0, 500) } })
      .catch(() => {});
  }
}
