import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';

const phone = (label) =>
  z
    .string({ required_error: `${label} est obligatoire.` })
    .trim()
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} n'est pas valide.` });
        return z.NEVER;
      }
      return n;
    });

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const item = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  choice: optionalText(40),
  note: optionalText(200),
});

// Mobile money : le client donne seulement le numéro qui a payé. L'équipe vérifie
// le paiement avec ce numéro et le montant (plus de numéro de transaction).
const mobileMoney = (method) =>
  z.object({
    method: z.literal(method),
    payerPhone: phone('Le numéro ayant payé'),
  });

export const createOrderSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(2, 'Indiquez votre nom complet.').max(80),
      phone: phone('Le numéro WhatsApp'),
    }),
    // Paiement obligatoire avant livraison : plus d'espèces (ESPECES reste dans l'enum Prisma,
    // sans migration, mais n'est plus accepté)
    payment: z.discriminatedUnion('method', [mobileMoney('ORANGE_MONEY'), mobileMoney('MOOV_MONEY'), mobileMoney('TELECEL_MONEY')], {
      errorMap: (issue, ctx) =>
        issue.code === z.ZodIssueCode.invalid_union_discriminator
          ? { message: 'Le paiement se fait uniquement par Orange Money, Moov Money ou Telecel Money.' }
          : { message: ctx.defaultError },
    }),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().nonnegative().max(100000).optional(),
      })
      .optional(),
    addressNote: optionalText(300),
    items: z.array(item).min(1, 'La commande est vide.').max(40),
  })
  .refine((o) => o.location || (o.addressNote && o.addressNote.length >= 5), {
    message: 'Partagez votre position ou indiquez votre quartier et un repère.',
    path: ['addressNote'],
  });
