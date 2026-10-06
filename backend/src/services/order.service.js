import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { formatPhone } from './customer-messages.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { newOrderReference } from '../utils/reference.js';
import { priceItems } from './pricing.js';
import { INITIAL_STATUS } from './order-status.js';
import { notifyTeamNewOrder } from './whatsapp.service.js';
import { pushTeamNewOrder } from './push.service.js';

export async function createOrder(input) {
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: true, category: true },
  });
  const { lines, itemsTotal } = priceItems(input.items, products);

  const { payment } = input;

  const data = {
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    paymentMethod: payment.method,
    paymentPayerPhone: payment.payerPhone,
    // paymentReference n'est plus renseigné : colonne laissée vide, sans migration pour l'instant
    latitude: input.location?.latitude ?? null,
    longitude: input.location?.longitude ?? null,
    locationAccuracy: input.location?.accuracy != null ? Math.round(input.location.accuracy) : null,
    addressNote: input.addressNote ?? null,
    itemsTotal,
    items: { create: lines },
    // Première ligne de l'historique : commande reçue, paiement à vérifier par l'équipe
    statusChanges: { create: { toStatus: INITIAL_STATUS } },
  };

  // La référence est aléatoire : on réessaie en cas de collision (très improbable)
  let order;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      order = await prisma.order.create({
        data: { ...data, reference: newOrderReference() },
        include: { items: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // collision de référence
      throw err;
    }
  }
  if (!order) throw new AppError(500, "La commande n'a pas pu être enregistrée. Réessayez.");

  // Alertes WhatsApp et téléphones de l'équipe en arrière-plan : le client n'attend pas l'envoi,
  // et un échec n'annule jamais la commande
  notifyTeamNewOrder(order).catch((e) => console.error('[whatsapp]', e));
  pushTeamNewOrder(order).catch((e) => console.error('[push]', e));

  return order;
}

// Récapitulatif public (page de confirmation). Aucune donnée de paiement ni position.
export async function getOrderSummary(reference) {
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: true, statusChanges: { orderBy: { createdAt: 'asc' } } },
  });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return toPublicOrder(order);
}

// Page de suivi : étapes datées, frais de livraison, motif d'annulation. Jamais de nom, numéro,
// position ni nom d'agent : la référence suffit pour la voir.
export function toPublicOrder(order) {
  const changes = order.statusChanges || [];
  return {
    reference: order.reference,
    status: order.status,
    createdAt: order.createdAt,
    paymentMethod: order.paymentMethod,
    itemsTotal: order.itemsTotal,
    deliveryFee: order.deliveryFee ?? null,
    // Frais payés au livreur à la réception (espèces ou mobile money) : payés une fois la commande remise
    deliveryFeePaid: order.deliveryFeeMethod != null,
    // Numéros marchands pour payer les frais par mobile money (les mêmes que dans les messages), tant qu'ils sont attendus
    payTo:
      order.deliveryFee != null && order.deliveryFeeMethod == null && order.status !== 'ANNULEE'
        ? { orangeMoney: formatPhone(env.orangeMoneyNumber), moovMoney: formatPhone(env.moovMoneyNumber) }
        : null,
    steps: changes.map((h) => ({ status: h.toStatus, at: h.createdAt })),
    cancelReason: changes.findLast((h) => h.toStatus === 'ANNULEE')?.reason || null,
    items: order.items.map((i) => ({
      productName: i.productName,
      productNumber: i.productNumber,
      variantLabel: i.variantLabel,
      choice: i.choice,
      note: i.note,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
  };
}
