import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { newOrderReference } from '../utils/reference.js';
import { priceItems } from './pricing.js';
import { notifyTeamNewOrder } from './whatsapp.service.js';

const DUPLICATE_PAYMENT = () =>
  new AppError(409, 'Ce numéro de transaction a déjà été utilisé pour une autre commande.', 'TRANSACTION_DEJA_UTILISEE');

export async function createOrder(input) {
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: true, category: true },
  });
  const { lines, itemsTotal } = priceItems(input.items, products);

  const { payment } = input;
  const isMobileMoney = payment.method !== 'ESPECES';

  if (isMobileMoney) {
    const used = await prisma.order.findFirst({
      where: { paymentMethod: payment.method, paymentReference: payment.reference },
      select: { id: true },
    });
    if (used) throw DUPLICATE_PAYMENT();
  }

  const data = {
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    paymentMethod: payment.method,
    paymentPayerPhone: isMobileMoney ? payment.payerPhone : null,
    paymentReference: isMobileMoney ? payment.reference : null,
    latitude: input.location?.latitude ?? null,
    longitude: input.location?.longitude ?? null,
    locationAccuracy: input.location?.accuracy != null ? Math.round(input.location.accuracy) : null,
    addressNote: input.addressNote ?? null,
    itemsTotal,
    items: { create: lines },
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String(err.meta?.target ?? '');
        if (target.includes('paymentReference')) throw DUPLICATE_PAYMENT();
        continue; // collision de référence
      }
      throw err;
    }
  }
  if (!order) throw new AppError(500, "La commande n'a pas pu être enregistrée. Réessayez.");

  // Alerte WhatsApp en arrière-plan : le client n'attend pas l'envoi
  notifyTeamNewOrder(order).catch((e) => console.error('[whatsapp]', e));

  return order;
}

// Récapitulatif public (page de confirmation). Aucune donnée de paiement ni position.
export async function getOrderSummary(reference) {
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: true },
  });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return toPublicOrder(order);
}

export function toPublicOrder(order) {
  return {
    reference: order.reference,
    status: order.status,
    createdAt: order.createdAt,
    paymentMethod: order.paymentMethod,
    itemsTotal: order.itemsTotal,
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
