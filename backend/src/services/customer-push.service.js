// Plan 4, suivi sans WhatsApp : alertes gratuites (Web Push) sur le téléphone du client (règles dans tracking.js).
// Seulement quand l'interrupteur SUIVI_SANS_WHATSAPP est ouvert et que les clés VAPID sont réglées.
import { prisma } from '../lib/prisma.js';
import { pushEnabled } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { isFeatureOpen } from './features.service.js';
import { CUSTOMER_TRACKING } from './features.js';
import { webPush, shouldRemove } from './push.service.js';
import { customerPushPayload, keyMatches, MAX_CUSTOMER_DEVICES } from './tracking.js';

const NOT_FOUND = () => new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');

// Le client demande les alertes de sa commande depuis sa page de suivi (avec la clé du lien)
export async function subscribeCustomer(reference, { cle, subscription }) {
  if (!pushEnabled() || !(await isFeatureOpen(CUSTOMER_TRACKING))) {
    throw new AppError(404, 'Les alertes ne sont pas disponibles.', 'ALERTES_INDISPONIBLES');
  }
  const order = await prisma.order.findUnique({
    where: { reference },
    select: { id: true, status: true, trackingKey: true, customerPushes: { select: { endpoint: true } } },
  });
  if (!order || !keyMatches(order, cle)) throw NOT_FOUND(); // même réponse : on ne dit pas si la commande existe
  if (['LIVREE', 'ANNULEE'].includes(order.status)) throw new AppError(400, 'Cette commande est terminée.', 'COMMANDE_TERMINEE');
  const known = order.customerPushes.some((s) => s.endpoint === subscription.endpoint);
  if (!known && order.customerPushes.length >= MAX_CUSTOMER_DEVICES) {
    throw new AppError(400, 'Trop de téléphones pour cette commande.', 'TROP_DE_TELEPHONES');
  }
  const keys = { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth };
  await prisma.customerPushSubscription.upsert({
    where: { orderId_endpoint: { orderId: order.id, endpoint: subscription.endpoint } },
    create: { orderId: order.id, endpoint: subscription.endpoint, ...keys },
    update: { ...keys, failures: 0 },
  });
}

// Alerte de l'étape au client, si la commande est à l'une de ces étapes (statuses). N'échoue jamais.
//   après un changement (afterChange) : « en route » (livraison), « prête » (à récupérer) ;
//   après la remise (notifyDelivered) : « livrée, merci ».
export function notifyCustomer(reference, statuses) {
  (async () => {
    if (!pushEnabled() || !(await isFeatureOpen(CUSTOMER_TRACKING))) return;
    const order = await prisma.order.findUnique({
      where: { reference },
      select: { id: true, reference: true, status: true, mode: true, language: true, courierName: true, trackingKey: true, customerPushes: true },
    });
    if (!order || !statuses.includes(order.status) || !order.customerPushes.length) return;
    const payload = customerPushPayload(order);
    if (!payload) return;
    for (const sub of order.customerPushes) {
      const result = await webPush(sub, payload);
      if (result.ok) {
        if (sub.failures) await prisma.customerPushSubscription.update({ where: { id: sub.id }, data: { failures: 0 } }).catch(() => {});
      } else if (shouldRemove(result.statusCode, sub.failures)) {
        await prisma.customerPushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        await prisma.customerPushSubscription.update({ where: { id: sub.id }, data: { failures: { increment: 1 } } }).catch(() => {});
      }
    }
  })().catch((e) => console.error('[push] client', e));
}
