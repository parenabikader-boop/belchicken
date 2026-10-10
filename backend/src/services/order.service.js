import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { paymentCodes } from './payment-codes.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { newOrderReference } from '../utils/reference.js';
import { priceItems } from './pricing.js';
import { orderFeeFields } from './delivery-fees.js';
import { quoteForOrder } from './delivery-fees.service.js';
import { INITIAL_STATUS } from './order-status.js';
import { notifyTeamNewOrder } from './whatsapp.service.js';
import { feePaymentOf } from './delivery-mode.js';
import { getDeliveryMode, messageContextFor } from './delivery-mode.service.js';
import { pushTeamNewOrder } from './push.service.js';

// Commande du site, ou saisie par un agent (lot 2) : `agent` = { source, staff } (provenance déjà vérifiée).
// Même calcul des prix et des frais, même départ « paiement à vérifier », dans les deux cas.
export async function createOrder(input, agent = null) {
  // Plats et boissons choisies dans les formules
  const productIds = [...new Set(input.items.flatMap((i) => [i.productId, ...(i.drinks || []).map((d) => d.productId)]))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: true, category: true },
  });
  const { lines, itemsTotal } = priceItems(input.items, products);

  const { payment } = input;
  // À emporter : ni position ni repères (le client vient au restaurant)
  const delivery = input.mode !== 'A_EMPORTER';
  // Frais de livraison : calculés ici avec la grille du Patron et copiés dans la commande
  // (grille vide : rien, l'équipe les saisit comme avant)
  const fee = delivery ? orderFeeFields(await quoteForOrder(input.delivery, input.location)) : {};
  // Lot 5 : qui livre et encaisse les frais, figé ici (mode Restaurant sans réglage du Prestataire).
  // À emporter : pas de livraison, donc Restaurant.
  const deliveryOperator = delivery ? await getDeliveryMode() : 'RESTAURANT';

  const data = {
    mode: input.mode,
    deliveryOperator,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    paymentMethod: payment.method,
    paymentPayerPhone: payment.payerPhone,
    // paymentReference n'est plus renseigné : colonne laissée vide, sans migration pour l'instant
    latitude: delivery ? input.location?.latitude ?? null : null,
    longitude: delivery ? input.location?.longitude ?? null : null,
    locationAccuracy: delivery && input.location?.accuracy != null ? Math.round(input.location.accuracy) : null,
    addressNote: delivery ? input.addressNote ?? null : null,
    itemsTotal,
    ...fee,
    items: { create: lines.map(({ drinks, ...l }) => ({ ...l, drinks: { create: drinks } })) },
    // Première ligne de l'historique : commande reçue, paiement à vérifier par l'équipe
    // (saisie par un agent : à son nom)
    statusChanges: { create: { toStatus: INITIAL_STATUS, ...(agent && { staffUserId: agent.staff.id, staffName: agent.staff.name }) } },
    ...(agent && {
      sourceId: agent.source.id,
      sourceName: agent.source.name,
      createdById: agent.staff.id,
      createdByName: agent.staff.name,
    }),
  };

  // La référence est aléatoire : on réessaie en cas de collision (très improbable)
  let order;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      order = await prisma.order.create({
        data: { ...data, reference: newOrderReference() },
        include: { items: { include: { drinks: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // collision de référence
      throw err;
    }
  }
  if (!order) throw new AppError(500, "La commande n'a pas pu être enregistrée. Réessayez.");

  // Alertes WhatsApp et téléphones de l'équipe en arrière-plan : le client n'attend pas l'envoi,
  // et un échec n'annule jamais la commande
  // (saisie par un agent : pas sur ses propres téléphones, il vient de la créer)
  notifyTeamNewOrder(order).catch((e) => console.error('[whatsapp]', e));
  pushTeamNewOrder(order, { exceptStaffId: agent?.staff.id }).catch((e) => console.error('[push]', e));

  return order;
}

// Récapitulatif public (page de confirmation). Aucune donnée de paiement ni position.
export async function getOrderSummary(reference) {
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: { include: { drinks: true } }, statusChanges: { orderBy: { createdAt: 'asc' } } },
  });
  if (!order) throw new AppError(404, 'Commande introuvable.', 'COMMANDE_INTROUVABLE');
  return toPublicOrder(order, await messageContextFor(order));
}

// Page de suivi : étapes datées, frais de livraison, motif d'annulation. Jamais de nom, numéro,
// position ni nom d'agent : la référence suffit pour la voir.
// ctx : contexte des messages (lot 5 : nos codes pour les frais d'une commande en mode Prestataire)
export function toPublicOrder(order, ctx = { payment: env.payment }) {
  const changes = order.statusChanges || [];
  return {
    reference: order.reference,
    status: order.status,
    mode: order.mode,
    createdAt: order.createdAt,
    paymentMethod: order.paymentMethod,
    itemsTotal: order.itemsTotal,
    deliveryFee: order.deliveryFee ?? null,
    deliveryNightFee: order.deliveryNightFee ?? null, // lot 3 : dont supplément de nuit
    // Quartier choisi (copié à la commande) ; A_CONFIRMER = frais confirmés par l'équipe au téléphone
    deliveryZoneName: order.deliveryZoneName ?? null,
    deliveryFeeSource: order.deliveryFeeSource ?? null,
    // Frais payés au livreur à la réception (espèces ou mobile money) : payés une fois la commande remise
    deliveryFeePaid: order.deliveryFeeMethod != null,
    // Codes marchands avec le montant des frais (les mêmes que dans les messages), tant qu'ils sont attendus
    feePayment:
      order.deliveryFee > 0 && order.deliveryFeeMethod == null && order.status !== 'ANNULEE' // 0 F : livraison offerte
        ? { ...paymentCodes(feePaymentOf(order, ctx), order.deliveryFee), operator: order.deliveryOperator ?? 'RESTAURANT' }
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
      drinks: (i.drinks || []).map((d) => ({ name: d.name, quantity: d.quantity })),
    })),
  };
}
