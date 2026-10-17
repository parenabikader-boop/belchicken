// Compte Patron simplifié (interrupteur COMPTE_PATRON_SIMPLE) : résumé du soir, résumé de la semaine (lundi matin) et
// alerte « plat en rupture depuis longtemps », envoyés sur le téléphone du Patron (Web Push, gratuit).
// Règles sans base de données, testées dans test/compte-patron.test.js ; envois dans patron-accounts.service.js.
//
// Render gratuit s'endort : l'heure n'est jamais attendue par un minuteur. Un service de réveil gratuit (cron-job.org)
// appelle /api/reveil toutes les 10 minutes avec une clé secrète ; à chaque appel, le serveur regarde ce qui est dû.
// Chaque résumé est noté comme envoyé (jour ou semaine) avant d'être envoyé : jamais deux fois. Un résumé en retard
// de plus de LATE_HOURS (serveur injoignable) n'est plus envoyé : un résumé du soir le lendemain midi ne sert à rien.
import { z } from 'zod';
import { formatFcfa } from '../utils/format.js';
import { DAY, dayKey } from './statement.js';

export const DEFAULT_SETTINGS = { eveningOn: true, eveningHour: 22, weeklyOn: true, weeklyHour: 8 };
export const LATE_HOURS = 3;
// Avant 6 h, le résumé du soir parle de la veille (journée finie après minuit, le vendredi et le samedi)
export const NIGHT_UNTIL = 6;
// Plat en rupture depuis plus de OUTAGE_HOURS : une alerte, une seule fois par rupture
export const OUTAGE_HOURS = 24;

const hour = z.coerce.number({ invalid_type_error: 'Choisissez une heure.' }).int().min(0, 'Heure entre 0 et 23.').max(23, 'Heure entre 0 et 23.');
export const digestSettingsSchema = z.object({
  eveningOn: z.boolean(),
  eveningHour: hour,
  weeklyOn: z.boolean(),
  weeklyHour: hour,
}).strict();

const startOfDay = (t) => Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());

// Journée du résumé du soir à l'heure `h` : aujourd'hui, ou la veille si l'heure choisie est avant 6 h
export function eveningDay(now, h) {
  const today = startOfDay(now);
  return new Date(h < NIGHT_UNTIL ? today - DAY : today);
}

// Résumés dus maintenant. state : { lastEveningFor, lastWeeklyFor } (jour ou lundi déjà envoyés, AAAA-MM-JJ).
// Renvoie [{ kind: 'soir', key, from, to }, { kind: 'semaine', key, from, to }] (0, 1 ou 2).
export function dueDigests(now, settings = DEFAULT_SETTINGS, state = {}) {
  const out = [];
  const today = startOfDay(now);
  const inWindow = (at) => now.getTime() >= at && now.getTime() < at + LATE_HOURS * 3600 * 1000;
  if (settings.eveningOn) {
    const at = today + settings.eveningHour * 3600 * 1000;
    const day = eveningDay(now, settings.eveningHour);
    const key = dayKey(day);
    if (inWindow(at) && state.lastEveningFor !== key) {
      out.push({ kind: 'soir', key, from: day, to: new Date(Math.min(now.getTime(), day.getTime() + DAY)) });
    }
  }
  if (settings.weeklyOn && now.getUTCDay() === 1) {
    const at = today + settings.weeklyHour * 3600 * 1000;
    const monday = new Date(today - 7 * DAY); // la semaine finie : lundi dernier à dimanche
    const key = dayKey(monday);
    if (inWindow(at) && state.lastWeeklyFor !== key) out.push({ kind: 'semaine', key, from: monday, to: new Date(today) });
  }
  return out;
}

const rating = (n) => String(n).replace('.', ',');
const fDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fShort = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });

// stats : { revenue, paid, topDish: { name, quantity } | null, reviews: { average, count }, change (en %, semaine) }
export function digestNotification(kind, stats, from) {
  const parts = [`${formatFcfa(stats.revenue)} de ventes`, `${stats.paid} commande${stats.paid > 1 ? 's' : ''}`];
  if (kind === 'semaine' && stats.change != null) parts[0] += ` (${stats.change > 0 ? '+' : ''}${stats.change} %)`;
  if (stats.topDish) parts.push(`Meilleur plat : ${stats.topDish.name}`);
  if (stats.reviews?.count) parts.push(`Avis : ${rating(stats.reviews.average)}/5 (${stats.reviews.count})`);
  const title = kind === 'soir'
    ? `Votre journée · ${fDay.format(from)}`
    : `Votre semaine · du ${fShort.format(from)} au ${fShort.format(new Date(from.getTime() + 6 * DAY))}`;
  return {
    title,
    body: stats.paid ? parts.join(' · ') : 'Aucune vente sur cette période.',
    url: kind === 'soir' ? '/equipe/comptes?periode=jour' : '/equipe/comptes?periode=semaine',
    tag: `resume-${kind}-${dayKey(from)}`,
  };
}

// Mauvais avis pour le Patron : notes basses et commentaire du client (120 caractères), jamais son nom ni son numéro
export function lowReviewForPatron(order, review) {
  const low = [
    ['Call center', review.callCenterRating],
    ['Restaurant', review.foodRating],
    ['Livraison', review.deliveryRating],
  ].filter(([, n]) => n != null && n <= 2);
  const comment = review.comment?.trim();
  const short = comment && comment.length > 120 ? `${comment.slice(0, 119)}…` : comment;
  return {
    title: `Mauvais avis · ${low.map(([label, n]) => `${label} ${n}/5`).join(' · ')}`,
    body: short ? `« ${short} »` : 'Pas de commentaire.',
    url: '/equipe/avis',
    tag: `avis-${order.reference}`,
  };
}

// Ruptures de stock. products : plats du menu ({ id, name, isAvailable, archivedAt }) ; outages : { [id]: { since, alerted } }
// (première fois vue indisponible, à 10 minutes près). Renvoie le nouvel état et les plats à signaler maintenant.
export function outageUpdate(products, outages = {}, now = new Date(), hours = OUTAGE_HOURS) {
  const next = {};
  const alerts = [];
  for (const p of products) {
    if (p.archivedAt || p.isAvailable) continue;
    const cur = outages[p.id] || { since: now.toISOString(), alerted: false };
    if (!cur.alerted && now - new Date(cur.since) >= hours * 3600 * 1000) {
      alerts.push({ id: p.id, name: p.name, since: cur.since });
      next[p.id] = { since: cur.since, alerted: true };
    } else next[p.id] = cur;
  }
  return { outages: next, alerts };
}

export function outageNotification(alert, now = new Date()) {
  const h = Math.floor((now - new Date(alert.since)) / 3600000);
  const since = h >= 48 ? `${Math.floor(h / 24)} jours` : `${h} heures`;
  return {
    title: `Plat en rupture · ${alert.name}`,
    body: `Indisponible depuis plus de ${since}. Remettez-le disponible dans Menu quand il revient.`,
    url: '/equipe/menu',
    tag: `rupture-${alert.id}`,
  };
}
