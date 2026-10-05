import webpush from 'web-push';
import { env, pushEnabled } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { courseCancelledNotification, courseNotification, deliveredNotification, deviceLabel, newOrderNotification, testNotification } from './push.message.js';

// Notifications de l'équipe sur téléphone (Web Push), à côté de l'alerte WhatsApp.

// Au-delà de 5 échecs d'affilée, le téléphone est retiré de la liste
export const MAX_FAILURES = 5;

let configured = false;
function setup() {
  if (!configured) {
    webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
    configured = true;
  }
}

// Après un échec : faut-il retirer ce téléphone de la liste ?
// 404 et 410 : le service de notification dit que l'adresse n'existe plus (alertes coupées,
// application désinstallée, données effacées). Sinon, on retire après trop d'échecs d'affilée.
export function shouldRemove(statusCode, failuresBefore) {
  if (statusCode === 404 || statusCode === 410) return true;
  return failuresBefore + 1 >= MAX_FAILURES;
}

// Envoie à un téléphone. Renvoie { ok: true } ou { ok: false, removed, error }. Ne lève jamais d'erreur.
async function sendTo(sub, payload) {
  setup();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      // Une alerte de commande ne sert plus à rien après 1 heure ; « high » : réveille le téléphone
      { TTL: 60 * 60, urgency: 'high', timeout: 10000 },
    );
    await prisma.pushSubscription
      .update({ where: { id: sub.id }, data: { failures: 0, lastSuccessAt: new Date() } })
      .catch(() => {});
    return { ok: true };
  } catch (err) {
    const error = `${err.statusCode ? `HTTP ${err.statusCode} ` : ''}${err.body || err.message || ''}`.trim().slice(0, 500);
    const removed = shouldRemove(err.statusCode, sub.failures);
    await (removed
      ? prisma.pushSubscription.delete({ where: { id: sub.id } })
      : prisma.pushSubscription.update({ where: { id: sub.id }, data: { failures: { increment: 1 } } })
    ).catch(() => {});
    return { ok: false, removed, error };
  }
}

// Alerte toute l'équipe (Patron et Opérateur, pas les livreurs) d'une nouvelle commande.
// Ne lève jamais d'erreur : un échec d'envoi ne doit pas faire échouer la commande, il est journalisé.
export async function pushTeamNewOrder(order) {
  if (!pushEnabled()) return;
  await pushAndLog(order, { staffUser: { isActive: true, role: { in: ['PATRON', 'OPERATEUR'] } } }, newOrderNotification(order));
}

// Commande livrée : Patron et Opérateurs (pas les livreurs). Ne lève jamais d'erreur.
export async function pushTeamDelivered(order, info) {
  if (!pushEnabled()) return;
  await pushAndLog(order, { staffUser: { isActive: true, role: { in: ['PATRON', 'OPERATEUR'] } } }, deliveredNotification(order, info));
}

// Nouvelle course assignée : seulement les téléphones de ce livreur. Ne lève jamais d'erreur.
export async function pushCourierAssigned(order, courierId) {
  if (!pushEnabled()) return;
  await pushAndLog(order, { staffUserId: courierId, staffUser: { isActive: true } }, courseNotification(order));
}

// Course annulée pendant la livraison : prévient son livreur. Ne lève jamais d'erreur.
export async function pushCourseCancelled(order, courierId) {
  if (!pushEnabled()) return;
  await pushAndLog(order, { staffUserId: courierId, staffUser: { isActive: true } }, courseCancelledNotification(order));
}

async function pushAndLog(order, where, payload) {
  const subs = await prisma.pushSubscription.findMany({
    where,
    include: { staffUser: { select: { name: true } } },
  });
  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendTo(sub, payload);
      const recipient = `${sub.staffUser.name} (${deviceLabel(sub.userAgent)})`;
      if (!result.ok) console.error(`[push] échec vers ${recipient} pour ${order.reference} : ${result.error}${result.removed ? ' (retiré)' : ''}`);
      await prisma.notificationLog
        .create({
          data: {
            orderId: order.id,
            channel: 'PUSH',
            recipient: recipient.slice(0, 200),
            status: result.ok ? 'ENVOYEE' : 'ECHEC',
            error: result.ok ? null : `${result.error}${result.removed ? ' (téléphone retiré)' : ''}`.slice(0, 500),
          },
        })
        .catch(() => {});
    }),
  );
}

export const pushStatus = () => ({ enabled: pushEnabled(), publicKey: pushEnabled() ? env.push.publicKey : null });

// Enregistre (ou rattache au compte connecté) le téléphone qui active les alertes
export async function subscribe(user, { endpoint, keys }, userAgent) {
  if (!pushEnabled()) throw new AppError(503, 'Les alertes ne sont pas encore configurées sur le serveur.', 'ALERTES_NON_CONFIGUREES');
  const data = { p256dh: keys.p256dh, auth: keys.auth, staffUserId: user.id, userAgent: userAgent?.slice(0, 300) || null, failures: 0 };
  await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
}

// Coupe les alertes de ce téléphone (l'adresse d'envoi n'est connue que de lui)
export async function unsubscribe(endpoint) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// Notification d'essai, envoyée seulement au téléphone qui la demande
export async function sendTest(user, endpoint) {
  if (!pushEnabled()) throw new AppError(503, 'Les alertes ne sont pas encore configurées sur le serveur.', 'ALERTES_NON_CONFIGUREES');
  const sub = await prisma.pushSubscription.findFirst({ where: { endpoint, staffUserId: user.id } });
  if (!sub) throw new AppError(404, 'Les alertes ne sont pas activées sur ce téléphone.', 'ALERTES_INACTIVES');
  const result = await sendTo(sub, testNotification());
  if (!result.ok) {
    console.error(`[push] essai en échec pour ${user.name} : ${result.error}`);
    throw new AppError(
      502,
      result.removed
        ? 'Ce téléphone ne répond plus aux alertes. Réactivez-les avec le bouton « Recevoir les alertes ».'
        : "L'envoi de la notification a échoué. Réessayez dans un instant.",
      'ESSAI_ECHEC',
    );
  }
}
