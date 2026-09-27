import { env, whatsappEnabled } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { buildNewOrderParams } from './whatsapp.message.js';

async function sendTemplate(to, params) {
  const { apiVersion, phoneNumberId, token, templateNewOrder, templateLang } = env.whatsapp;
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateNewOrder,
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
        const id = await sendTemplate(to, params);
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
