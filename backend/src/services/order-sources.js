// Provenance des commandes et prise de commande par l'agent (lot 2, sans base de données,
// testé dans test/agent-orders.test.js).
//
// Le Patron règle la liste (page Réglages) : Site, Appel, WhatsApp +226 05 23 48 48, WhatsApp
// +226 50 62 70 70 (Telmob)… « Site » est réservée aux commandes passées par le client sur le site :
// jamais proposée à l'agent, refusée par l'API, ni modifiable, ni désactivable, ni supprimable.
// Une commande sans provenance (anciennes commandes, commandes du site) s'affiche « Site ».
import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';
import { formatPhone } from './customer-messages.js';

export const SITE_LABEL = 'Site';
export const SOURCE_NAME_MAX = 60;
// Types que le Patron peut choisir (SITE existe déjà, une seule fois)
export const AGENT_KINDS = ['APPEL', 'WHATSAPP', 'AUTRE'];

const text = (max, message) => z.string({ required_error: message }).trim().min(2, message).max(max, `${max} caractères au plus.`);

// Ajout ou modification d'une provenance par le Patron. WhatsApp : le numéro depuis lequel écrire au client.
export const sourceInputSchema = z
  .object({
    name: text(SOURCE_NAME_MAX, 'Indiquez le nom de la provenance.'),
    kind: z.enum(AGENT_KINDS, { errorMap: () => ({ message: 'Choisissez le type : appel, WhatsApp ou autre.' }) }),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        const n = normalizePhone(v);
        if (!n) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Le numéro WhatsApp n’est pas valide.' });
          return z.NEVER;
        }
        return n;
      }),
    isActive: z.boolean().optional(),
  })
  .refine((s) => s.kind !== 'WHATSAPP' || s.phone, { message: 'Indiquez le numéro WhatsApp depuis lequel écrire au client.', path: ['phone'] })
  // Pas de numéro pour un appel ou une autre provenance
  .transform((s) => (s.kind === 'WHATSAPP' ? s : { ...s, phone: null }));

// Seulement l'activation (bouton Activer / Désactiver)
export const sourceActiveSchema = z.object({ isActive: z.boolean() });

// Deux provenances ne peuvent pas avoir le même nom (sans tenir compte des majuscules ni des accents)
const plain = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const sameSourceName = (a, b) => plain(a) === plain(b);

// Provenance choisie par l'agent pour une nouvelle commande : null si acceptée, sinon le message
export function agentSourceError(source) {
  if (!source) return 'Provenance inconnue. Rechargez la page et choisissez-en une autre.';
  if (source.kind === 'SITE') return 'La provenance « Site » est réservée aux commandes passées par le client sur le site.';
  if (!source.isActive) return `La provenance « ${source.name} » n’est plus proposée. Choisissez-en une autre.`;
  return null;
}

// Liste proposée à l'agent : les provenances actives, dans l'ordre du Patron, jamais « Site »
export const agentChoices = (sources) =>
  sources
    .filter((s) => s.kind !== 'SITE' && s.isActive)
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ id: s.id, name: s.name, kind: s.kind, phone: s.phone || null }));

// Le Patron ne touche jamais à « Site »
export const siteLockedError = (source) =>
  source.kind === 'SITE' ? 'La provenance « Site » est fixe : elle sert aux commandes passées sur le site.' : null;

// Suppression : seulement une provenance jamais utilisée (sinon, la désactiver)
export function sourceDeleteError(source, usedCount) {
  return (
    siteLockedError(source) ||
    (usedCount > 0
      ? `« ${source.name} » a déjà servi pour ${usedCount} commande${usedCount > 1 ? 's' : ''} : désactivez-la plutôt.`
      : null)
  );
}

// Ce que l'équipe voit d'une commande : provenance, qui l'a saisie, qui a vérifié le paiement
export const sourceLabel = (o) => o.sourceName || SITE_LABEL;
export const enteredBy = (o) => o.createdByName || null; // null = le client lui-même, sur le site

// Paiement vérifié : la première fois que la commande est passée à « Payée » (parcours court compris,
// qui l'écrit aussi dans l'historique). null = pas encore vérifié.
export function paymentVerification(o) {
  const paid = (o.statusChanges || []).find((h) => h.toStatus === 'PAYEE');
  return paid ? { by: paid.staffName || null, at: paid.createdAt } : null;
}

// Commande arrivée par un WhatsApp du restaurant : l'agent répond depuis ce numéro, à chaque message.
// `o.source` : la provenance liée ({ kind, phone }). null = rien à préciser.
export function sendFrom(o) {
  if (o.source?.kind !== 'WHATSAPP' || !o.source.phone) return null;
  const phone = formatPhone(o.source.phone);
  return { phone, text: `Envoyez depuis WhatsApp ${phone}` };
}

// ─────────── Client retrouvé par son numéro ───────────
// `orders` : ses commandes, de la plus récente à la plus ancienne ({ customerName, mode, addressNote,
// deliveryZoneId, deliveryZoneName, createdAt }). `activeZoneIds` : quartiers encore proposés dans la grille.
// Nom de la dernière commande ; quartier et repères de la dernière livraison (un quartier retiré de la
// grille n'est pas repris). null = client inconnu.
export function customerPrefill(orders, count, activeZoneIds = new Set()) {
  if (!orders.length) return null;
  const [last] = orders;
  const delivery = orders.find((o) => o.mode !== 'A_EMPORTER');
  const zone = delivery?.deliveryZoneId && activeZoneIds.has(delivery.deliveryZoneId) ? { id: delivery.deliveryZoneId, name: delivery.deliveryZoneName } : null;
  return {
    name: last.customerName,
    addressNote: delivery?.addressNote || '',
    zone,
    ordersCount: count,
    lastOrderAt: last.createdAt,
  };
}
