// Démonstration commerciale : génère environ un mois d'activité fictive mais réaliste, SANS base de données
// (testé dans test/demo.test.js). demo-remplir.js écrit le résultat dans la base dev.
//
// Les prix viennent du menu lu dans la base (jamais inventés) et sont calculés par priceItems(), comme le
// serveur. Les étapes suivent les règles de l'espace équipe (order-status.js, customer-messages.js,
// dispatch.js, cash.js, review.js) : checkPlan() rejoue chaque commande avec ces règles.
//
// Heure du Burkina = UTC. Restaurant ouvert du dimanche au jeudi de 6 h à 23 h, vendredi et samedi 24 h/24
// (même règle que frontend/src/restaurant.js).
import { priceItems } from '../src/services/pricing.js';
import { FLOWS, transitionError, deliveryError, feeMethodError } from '../src/services/order-status.js';
import { noticeError, noticeState, needsThanks } from '../src/services/customer-messages.js';
import { isNightTime } from '../src/services/delivery-fees.js';
import { ASSIGNABLE, pickupError } from '../src/services/dispatch.js';
import { remitError, remitTotal } from '../src/services/cash.js';
import { REVIEW_DAYS, isLowRating } from '../src/services/review.js';
import {
  CUSTOMER_PHONE_PREFIX, DEMO_NIGHT, DEMO_REF_PREFIX, DEMO_SOURCES, DEMO_TERMS, DEMO_ZONES, STAFF_PHONE_PREFIX,
  demoName, isDemoOrder,
} from './demo-commun.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ─────────── Hasard reproductible (même graine = même démonstration) ───────────
export function makeRng(seed = 2026) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    chance: (p) => next() < p,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted: (list) => {
      const total = list.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [item, w] of list) if ((r -= w) < 0) return item;
      return list.at(-1)[0];
    },
    minutes: (min, max) => Math.round(rng.between(min, max) * MIN),
  };
  return rng;
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const newId = (rng) => `c${Array.from({ length: 24 }, () => ID_CHARS[Math.floor(rng.next() * ID_CHARS.length)]).join('')}`;
// Comme src/utils/reference.js, mais « BC-0… » : le 0 n'est jamais tiré pour une vraie commande
const REF_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newReference = (rng) => `${DEMO_REF_PREFIX}${Array.from({ length: 5 }, () => rng.pick([...REF_CHARS])).join('')}`;

// ─────────── Heures d'ouverture et affluence ───────────
const OPEN_ALL_DAY = [5, 6]; // vendredi, samedi
export const isOpenAt = (t) => {
  const d = new Date(t);
  return OPEN_ALL_DAY.includes(d.getUTCDay()) || (d.getUTCHours() >= 6 && d.getUTCHours() < 23);
};
// Commandes par heure (poids) : pointe de midi et du soir
const HOUR_WEIGHT = [0.5, 0.35, 0.2, 0.1, 0.05, 0.05, 0.2, 0.35, 0.5, 0.7, 1, 2, 4, 3.6, 1.8, 1, 1, 1.4, 2.2, 3.4, 4, 3.2, 1.8, 1];
function hourWeight(day, hour) {
  let w = HOUR_WEIGHT[hour];
  if (day === 6 && hour < 6) w *= 2; // nuit du vendredi au samedi
  if (OPEN_ALL_DAY.includes(day) && hour >= 19) w *= 1.4; // vendredi et samedi soir
  return w;
}
// Commandes par jour, du dimanche au samedi : beaucoup plus le vendredi et le samedi
const DAY_ORDERS = [22, 16, 17, 18, 20, 38, 44];

// ─────────── Équipe, clients, quartiers ───────────
export const STAFF = [
  { key: 'patron', name: 'Patron', role: 'PATRON', courierTeam: 'RESTAURANT' },
  { key: 'aminata', name: 'Aminata', role: 'OPERATEUR', courierTeam: 'RESTAURANT' },
  { key: 'salif', name: 'Salif', role: 'OPERATEUR', courierTeam: 'RESTAURANT' },
  { key: 'fatimata', name: 'Fatimata', role: 'OPERATEUR', courierTeam: 'RESTAURANT' },
  { key: 'issa', name: 'Issa', role: 'LIVREUR', courierTeam: 'RESTAURANT' },
  { key: 'boukary', name: 'Boukary', role: 'LIVREUR', courierTeam: 'RESTAURANT' },
  { key: 'ousmane', name: 'Ousmane', role: 'LIVREUR', courierTeam: 'RESTAURANT' },
  { key: 'mariam', name: 'Mariam', role: 'RESPONSABLE_LIVRAISON', courierTeam: 'PRESTATAIRE' },
  { key: 'rasmane', name: 'Rasmané', role: 'LIVREUR', courierTeam: 'PRESTATAIRE' },
  { key: 'inoussa', name: 'Inoussa', role: 'LIVREUR', courierTeam: 'PRESTATAIRE' },
  { key: 'adama', name: 'Adama', role: 'LIVREUR', courierTeam: 'PRESTATAIRE' },
  { key: 'moussa', name: 'Moussa', role: 'LIVREUR', courierTeam: 'PRESTATAIRE' },
];
const TERMS_AUTHOR = demoName('Prestataire');

const FIRST_NAMES = [
  'Awa', 'Fatou', 'Mariam', 'Aïcha', 'Rasmata', 'Salamata', 'Alimata', 'Safiatou', 'Bintou', 'Habibou', 'Kadiatou', 'Assétou',
  'Adjaratou', 'Pélagie', 'Clarisse', 'Estelle', 'Nadège', 'Sandrine', 'Ines', 'Carine', 'Abdoul', 'Ibrahim', 'Moussa', 'Seydou',
  'Souleymane', 'Hamidou', 'Boureima', 'Lassané', 'Arouna', 'Idrissa', 'Paul', 'Jean-Baptiste', 'Serge', 'Ismaël', 'Romaric',
  'Wendkouni', 'Teegwendé', 'Delwendé', 'Yacouba', 'Aristide', 'Hervé', 'Bachir', 'Cédric', 'Franck', 'Josué', 'Mathias',
];
const LAST_NAMES = [
  'Ouédraogo', 'Sawadogo', 'Kaboré', 'Traoré', 'Compaoré', 'Zongo', 'Ouattara', 'Sanou', 'Kiemdé', 'Nikiéma', 'Yaméogo',
  'Zoungrana', 'Ilboudo', 'Kinda', 'Tapsoba', 'Bationo', 'Diallo', 'Sankara', 'Somé', 'Dabiré', 'Kafando', 'Bambara', 'Coulibaly',
];

// « Autre quartier » : frais fixés par l'agent au téléphone (comme sans grille)
const FAR = [
  { name: 'Saaba', fee: 2500, km: [11, 15] },
  { name: 'Balkuy', fee: 2000, km: [9, 12] },
  { name: 'Yagma', fee: 2500, km: [10, 14] },
  { name: 'Kamboinsin', fee: 2500, km: [11, 15] },
];
const LANDMARKS = [
  'près de la pharmacie, portail bleu', 'derrière l’école primaire', 'à côté de la mosquée, 2e rue à droite',
  'face au maquis, maison avec un manguier', 'après le château d’eau, portail noir', 'près du marché, au-dessus de la boutique',
  'immeuble beige, 2e étage', 'à côté de la station-service', 'derrière l’église, villa jaune', 'au bout de la rue pavée',
];
const RESTAURANT = { lat: 12.352187, lng: -1.519188 };

const CANCEL_UNPAID = ['Paiement non reçu, client injoignable.', 'Le client a annulé avant de payer.', 'Doublon : le client avait déjà commandé.'];
const CANCEL_PREP = [
  'Le client a annulé : il ne sera plus à la maison.',
  'Plat en rupture, le client a préféré annuler (remboursé).',
  'Adresse hors de notre zone de livraison, client remboursé.',
];
const NO_CODE = ['Client sans son code (téléphone déchargé), identité vérifiée par appel.', 'Commande remise à un proche du client, confirmé par téléphone.'];
const PICKUP_NO_COURIER = 'Téléphone du livreur déchargé, récupération confirmée par la responsable.';

const GOOD_COMMENTS = [
  'Très bon, livré bien chaud.', 'Livreur poli et rapide.', 'Les tenders sont excellents !', 'Commande conforme, merci.',
  'Rapide même un vendredi soir.', 'Toute la famille s’est régalée.', 'Bon accueil au téléphone.', 'Parfait comme d’habitude.',
  'Frites un peu tièdes, mais le reste était top.', 'Je recommande !', 'Le paiement par code marchand est pratique.',
];
const LOW_COMMENTS = {
  delivery: ['Livraison très en retard, plus d’une heure.', 'Le livreur ne trouvait pas la maison, il a fallu l’appeler trois fois.'],
  food: ['Burger froid à l’arrivée.', 'Il manquait la boisson du menu.', 'Poulet trop salé cette fois.'],
  callCenter: ['Personne ne répondait sur WhatsApp, j’ai dû appeler.', 'Long à confirmer mon paiement.'],
};
const CALLBACK_NOTES = [
  'Client rappelé, excuses présentées. Boisson offerte à la prochaine commande.',
  'Rappelé : retard dû à l’affluence, client compréhensif.',
  'Rappelé, erreur de préparation reconnue et signalée en cuisine.',
];

// ─────────── Paniers à partir du vrai menu ───────────
const CATEGORY_WEIGHT = { burgers: 30, poulet: 28, combos: 8, buckets: 8, wraps: 8, 'rice-box': 6, salades: 4, 'bel-kids': 3 };
const ADDON_CATEGORIES = ['extras'];
const usable = (p) => p.isAvailable && !p.archivedAt && p.category?.isActive && p.variants.length > 0;

export function menuFrom(products) {
  const ok = products.filter(usable);
  const drinks = ok.filter((p) => p.category.isDrinks);
  const addons = ok.filter((p) => !p.category.isDrinks && ADDON_CATEGORIES.includes(p.category.slug));
  const mains = ok.filter((p) => !p.category.isDrinks && !ADDON_CATEGORIES.includes(p.category.slug));
  return { products, drinks, addons, mains };
}

function chooseVariant(rng, p) {
  const menu = p.variants.find((v) => v.code === 'menu');
  if (menu && rng.chance(0.65)) return menu;
  return rng.pick(p.variants);
}

function itemFor(rng, menu, p) {
  const variant = chooseVariant(rng, p);
  const drinkCount = variant.drinkCount ?? 0;
  const item = {
    productId: p.id,
    variantId: variant.id,
    quantity: drinkCount ? 1 : rng.chance(0.15) ? 2 : 1,
    ...(p.choices?.length ? { choice: rng.pick(p.choices) } : {}),
  };
  if (drinkCount) {
    if (!menu.drinks.length) return null; // formule impossible sans boisson disponible
    item.drinks = Array.from({ length: drinkCount }, () => ({ productId: rng.pick(menu.drinks).id, quantity: 1 }));
  }
  return item;
}

function basket(rng, menu, { evening }) {
  const weights = menu.mains.map((p) => {
    let w = CATEGORY_WEIGHT[p.category.slug] ?? 3;
    if (evening && p.category.slug === 'buckets') w *= 2;
    return [p, w / Math.max(1, menu.mains.filter((q) => q.category.slug === p.category.slug).length)];
  });
  const count = rng.weighted([[1, 55], [2, 32], [3, 13]]);
  const items = [];
  for (let i = 0; i < count && weights.length; i++) {
    const item = itemFor(rng, menu, rng.weighted(weights));
    if (item) items.push(item);
  }
  if (menu.addons.length && rng.chance(0.35)) {
    const item = itemFor(rng, menu, rng.pick(menu.addons));
    if (item) items.push(item);
  }
  if (menu.drinks.length && rng.chance(0.3)) items.push(itemFor(rng, menu, rng.pick(menu.drinks)));
  return items.filter(Boolean);
}

// ─────────── Génération ───────────
const startOfDay = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// days : jours complets avant aujourd'hui ; prestataireFromDay : 1er jour (0 = le plus ancien) en mode Prestataire
// rush (lot 12, npm run demo:affluence) : coup de feu d'un soir, seulement les commandes de la dernière heure environ,
//   { count, windowMinutes, restaurantShare, slowShare, pendingShare } ; une partie traîne (slowShare), une autre
//   attend encore le message au client (pendingShare) ; ni remise d'espèces ni avis.
// existing : comptes, provenances et quartiers « Démo » déjà dans dev ({ staff, sources, zones }), réutilisés tels quels.
// Sans rush ni existing, la démonstration est exactement la même qu'avant (mêmes tirages).
export function generatePlan({ products, now = new Date(), days = 30, prestataireFromDay = 10, seed = 2026, rush = null, existing = null }) {
  const rng = makeRng(seed);
  const nowMs = now.getTime();
  const firstDay = startOfDay(nowMs) - days * DAY;
  const switchAt = firstDay + prestataireFromDay * DAY;
  const menu = menuFrom(products);
  if (!menu.mains.length) throw new Error('Menu vide sur dev : impossible de créer des commandes.');

  // Équipe et provenances « Démo »
  const staff = STAFF.map((s, i) => ({ ...s, id: newId(rng), name: demoName(s.name), phone: `${STAFF_PHONE_PREFIX}${String(i + 1).padStart(3, '0')}` }));
  const who = Object.fromEntries(staff.map((s) => [s.key, s]));
  const sources = DEMO_SOURCES.map((s, i) => ({ ...s, id: newId(rng), position: 90 + i }));
  const zones = DEMO_ZONES.map((z) => ({ ...z, id: newId(rng) }));
  // Coup de feu : les comptes, provenances et quartiers « Démo » de dev (mêmes numéros, mêmes noms)
  if (existing) {
    const find = (list, test, what) => {
      const found = list.find(test);
      if (!found) throw new Error(`${what} absent de dev : lancez d'abord npm run demo:remplir.`);
      return found;
    };
    for (const s of staff) Object.assign(s, { id: find(existing.staff, (x) => x.phone === s.phone, `Compte ${s.name}`).id });
    for (const s of sources) Object.assign(s, { id: find(existing.sources, (x) => x.name === s.name, `Provenance ${s.name}`).id });
    for (const z of zones) {
      const e = find(existing.zones, (x) => x.name === z.name, `Quartier ${z.name}`);
      Object.assign(z, { id: e.id, fee: e.fee, nightFee: e.nightFee });
    }
  }
  const restaurantCouriers = staff.filter((s) => s.role === 'LIVREUR' && s.courierTeam === 'RESTAURANT');
  const partnerCouriers = staff.filter((s) => s.role === 'LIVREUR' && s.courierTeam === 'PRESTATAIRE');

  // Agent de service : matin Aminata (dimanche Fatimata), après-midi et soir Salif, nuit Fatimata
  const agentAt = (t) => {
    const d = new Date(t);
    const h = d.getUTCHours();
    if (h >= 6 && h < 15) return d.getUTCDay() === 0 ? who.fatimata : who.aminata;
    if (h >= 15 && (h < 23 || !OPEN_ALL_DAY.includes(d.getUTCDay()))) return who.salif;
    return who.fatimata;
  };
  const verifierAt = (t) => {
    const h = new Date(t).getUTCHours();
    return h >= 9 && h < 20 && rng.chance(0.08) ? who.patron : agentAt(t);
  };

  // Clients : quelques habitués qui reviennent souvent, et beaucoup d'autres
  const customers = Array.from({ length: 420 }, (_, i) => ({
    name: demoName(`${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`),
    phone: `${CUSTOMER_PHONE_PREFIX}${String(1000 + i).padStart(4, '0')}`,
  }));
  const regulars = customers.slice(0, 45);
  let otherPhone = 6000;

  // 1. Heures de commande, jour par jour (aujourd'hui : seulement jusqu'à maintenant)
  const times = [];
  // Coup de feu : les commandes arrivent pendant la dernière heure environ (heures d'ouverture seulement)
  for (let i = 0; rush && i < rush.count; i++) {
    const t = nowMs - Math.round(rng.between(1, rush.windowMinutes) * MIN);
    if (isOpenAt(t)) times.push(t);
  }
  for (let d = 0; !rush && d <= days; d++) {
    const dayStart = firstDay + d * DAY;
    const weekday = new Date(dayStart).getUTCDay();
    const trend = 0.85 + (0.3 * d) / days; // l'activité grandit au fil du mois
    const count = Math.round(DAY_ORDERS[weekday] * trend * rng.between(0.88, 1.12));
    const hours = Array.from({ length: 24 }, (_, h) => [h, isOpenAt(dayStart + h * HOUR) ? hourWeight(weekday, h) : 0]);
    for (let i = 0; i < count; i++) {
      const t = dayStart + rng.weighted(hours) * HOUR + Math.floor(rng.next() * 60) * MIN + rng.int(0, 59) * 1000;
      if (t <= nowMs) times.push(t);
    }
  }
  times.sort((a, b) => a - b);
  const load = (t) => {
    let n = 0;
    for (const x of times) if (Math.abs(x - t) <= 30 * MIN) n++;
    return n;
  };

  // 2. Commandes jusqu'à la préparation
  const refs = new Set();
  const records = times.map((t0) => {
    let reference;
    do reference = newReference(rng);
    while (refs.has(reference));
    refs.add(reference);
    const night = new Date(t0).getUTCHours() < 6 || new Date(t0).getUTCHours() >= 23;
    const agent = rng.chance(night ? 0.2 : 0.4) ? agentAt(t0) : null;
    const mode = rng.chance(agent ? 0.2 : night ? 0.1 : 0.27) ? 'A_EMPORTER' : 'LIVRAISON';
    // Coup de feu : livraisons de notre équipe et quelques-unes du restaurant (commandes d'avant le changement de mode)
    const operator = mode === 'LIVRAISON' && (rush ? !rng.chance(rush.restaurantShare) : t0 >= switchAt) ? 'PRESTATAIRE' : 'RESTAURANT';
    const customer = rng.chance(0.35) ? rng.pick(regulars) : rng.pick(customers);
    const evening = new Date(t0).getUTCHours() >= 18;

    let items = basket(rng, menu, { evening });
    if (!items.length) items = [itemFor(rng, menu, menu.mains[0])].filter(Boolean);
    const { lines, itemsTotal } = priceItems(items, menu.products);

    const o = {
      id: newId(rng),
      reference,
      customerName: customer.name,
      customerPhone: customer.phone,
      mode,
      deliveryOperator: operator,
      shortFlow: false,
      language: null,
      source: agent ? (rng.chance(0.55) ? sources[0] : sources[1]) : null,
      agent,
      paymentMethod: rng.weighted([['ORANGE_MONEY', 55], ['MOOV_MONEY', 35], ['TELECEL_MONEY', 10]]),
      paymentPayerPhone: rng.chance(0.85) ? customer.phone : `${CUSTOMER_PHONE_PREFIX}${otherPhone++}`,
      itemsTotal,
      items,
      lines: lines.map((l) => ({ ...l, id: newId(rng), drinks: l.drinks.map((d) => ({ ...d, id: newId(rng) })) })),
      createdAt: t0,
      actions: [],
    };

    // Livraison : quartier de la grille fictive (supplément de nuit compris), ou autre quartier (frais au téléphone)
    if (mode === 'LIVRAISON') {
      const far = rng.chance(0.06);
      const zone = far ? rng.pick(FAR) : rng.weighted(zones.map((z) => [z, z.w]));
      const km = rng.between(...zone.km);
      const angle = rng.between(0, 2 * Math.PI);
      o.latitude = Number((RESTAURANT.lat + (km / 111) * Math.sin(angle)).toFixed(6));
      o.longitude = Number((RESTAURANT.lng + (km / 111) * Math.cos(angle)).toFixed(6));
      o.locationAccuracy = rng.int(8, 35);
      o.addressNote = `${zone.name}, ${rng.pick(LANDMARKS)}`;
      o.km = km;
      if (far) {
        o.deliveryFeeSource = 'A_CONFIRMER';
        o.deliveryFee = null;
        o.agentFee = zone.fee;
      } else {
        // Comme withNight() de delivery-fees.js : le supplément du quartier, ajouté pendant la nuit
        const nightFee = zone.nightFee > 0 && isNightTime({ startMin: DEMO_NIGHT.nightStartMin, endMin: DEMO_NIGHT.nightEndMin }, new Date(t0)) ? zone.nightFee : 0;
        o.deliveryFeeSource = 'QUARTIER';
        o.deliveryZoneId = zone.id;
        o.deliveryZoneName = zone.name;
        o.deliveryFee = zone.fee + nightFee;
        o.deliveryNightFee = nightFee || null;
      }
      o.feeMethod = rng.chance(0.55) ? 'ESPECES' : 'MOBILE_MONEY';
    }

    const act = (at, a) => o.actions.push({ at, ...a });
    const status = (at, from, to, by, reason = null) => act(at, { kind: 'status', from, to, by, reason });
    const message = (at, key, by, type = rng.chance(0.95) ? 'MESSAGE_ENVOYE' : 'CLIENT_APPELE') => act(at, { kind: 'event', type, messageKey: key, by });

    // Coup de feu : une partie des commandes traîne (agents débordés, cuisine en retard), d'autres attendent encore
    // le message au client (l'agent ne l'a pas confirmé). Sans coup de feu : aucun tirage de plus.
    o.slow = rush && rng.chance(rush.slowShare) ? 2.5 : 1;
    o.pending = Boolean(rush) && rng.chance(rush.pendingShare);
    const gap = (min, max) => (o.pending ? rng.minutes(8, 20) : rng.minutes(min, max));

    status(t0, null, 'PAIEMENT_A_VERIFIER', agent);
    if (agent) message(t0 + rng.minutes(1, 2), mode === 'A_EMPORTER' ? 'COMMANDE_A_PAYER_EMPORTER' : 'COMMANDE_A_PAYER', agent, 'MESSAGE_ENVOYE');

    const cancel = rng.weighted([[null, 960], ['UNPAID', 25], ['PREP', 15]]);
    if (cancel === 'UNPAID') {
      const at = t0 + rng.minutes(35, 70);
      status(at, 'PAIEMENT_A_VERIFIER', 'ANNULEE', agentAt(at), rng.pick(CANCEL_UNPAID));
      if (rng.chance(0.6)) message(at + rng.minutes(1, 3), 'ANNULEE', agentAt(at));
      return o;
    }

    // Parcours court : « Paiement vérifié » fait Payée puis En préparation, un seul message
    const busy = load(t0);
    const paidAt = t0 + Math.round((agent ? rng.minutes(1, 5) : rng.minutes(2, 9) + Math.min(8, busy * 0.25) * MIN) * o.slow);
    const verifier = verifierAt(paidAt);
    o.shortFlow = true;
    o.paidAt = paidAt;
    status(paidAt, 'PAIEMENT_A_VERIFIER', 'PAYEE', verifier);
    status(paidAt, 'PAYEE', 'EN_PREPARATION', verifier);
    if (o.deliveryFeeSource === 'A_CONFIRMER') act(paidAt, { kind: 'event', type: 'FRAIS_SAISIS', amount: o.agentFee, by: verifier, fee: o.agentFee });
    const preparedMsgAt = paidAt + gap(1, 3);
    message(preparedMsgAt, mode === 'A_EMPORTER' ? 'PAIEMENT_PREPARATION_EMPORTER' : 'PAIEMENT_PREPARATION', verifier);
    o.preparedMsgAt = preparedMsgAt;

    if (cancel === 'PREP') {
      const at = preparedMsgAt + rng.minutes(3, 15);
      status(at, 'EN_PREPARATION', 'ANNULEE', agentAt(at), rng.pick(CANCEL_PREP));
      message(at + rng.minutes(1, 3), 'ANNULEE', agentAt(at));
      return o;
    }

    o.readyAt = Math.max(paidAt + Math.round((rng.minutes(12, 22) + Math.min(12, busy * 0.35) * MIN) * o.slow), preparedMsgAt + MIN);
    if (mode === 'A_EMPORTER') {
      // Prête (code de retrait), message avec l'adresse, retrait au comptoir avec le code, remerciement
      status(o.readyAt, 'EN_PREPARATION', 'PRETE', agentAt(o.readyAt));
      const readyMsg = o.readyAt + gap(1, 2);
      message(readyMsg, 'COMMANDE_PRETE', agentAt(o.readyAt));
      const takenAt = readyMsg + Math.round(rng.minutes(8, 45) * o.slow);
      status(takenAt, 'PRETE', 'LIVREE', agentAt(takenAt));
      o.deliveredAt = takenAt;
      message(takenAt + gap(2, 20), 'RETIREE', agentAt(takenAt));
    }
    return o;
  });

  const rideMinutes = (km) => 6 + km * 2.2 + rng.between(-2, 6);
  const delivered = (o, at, courier) => {
    o.deliveredAt = at;
    o.courier = courier;
    if (rng.chance(0.03)) {
      const agent = agentAt(at);
      o.actions.push({ at, kind: 'status', from: 'EN_LIVRAISON', to: 'LIVREE', by: agent, reason: rng.pick(NO_CODE) });
      o.actions.push({ at, kind: 'event', type: 'LIVRAISON_SANS_CODE', by: agent });
    } else {
      o.actions.push({ at, kind: 'status', from: 'EN_LIVRAISON', to: 'LIVREE', by: courier });
    }
    o.actions.push({ at: at + (o.pending ? rng.minutes(8, 20) : rng.minutes(2, 15)), kind: 'event', type: 'MESSAGE_ENVOYE', messageKey: 'LIVREE', by: agentAt(at) });
  };
  const routeGap = (o, min, max) => (o.pending ? rng.minutes(8, 20) : rng.minutes(min, max));
  const toDeliver = (op) => records.filter((o) => o.readyAt && o.mode === 'LIVRAISON' && o.deliveryOperator === op).sort((a, b) => a.readyAt - b.readyAt);

  // 3a. Livraison par le restaurant : l'agent fait partir le livreur le plus tôt libre
  const free = new Map(restaurantCouriers.map((c) => [c.id, 0]));
  for (const o of toDeliver('RESTAURANT')) {
    const courier = [...restaurantCouriers].sort((a, b) => free.get(a.id) - free.get(b.id) || rng.next() - 0.5)[0];
    const leave = Math.max(o.readyAt, free.get(courier.id)) + rng.minutes(1, 4);
    const agent = agentAt(leave);
    o.actions.push({ at: leave, kind: 'status', from: 'EN_PREPARATION', to: 'EN_LIVRAISON', by: agent });
    o.actions.push({ at: leave, kind: 'assign', courier, run: null });
    o.actions.push({ at: leave, kind: 'event', type: 'LIVREUR_ASSIGNE', courierName: courier.name, by: agent });
    const routeMsg = leave + routeGap(o, 1, 2);
    o.actions.push({ at: routeMsg, kind: 'event', type: 'MESSAGE_ENVOYE', messageKey: 'EN_ROUTE', by: agent });
    const ride = rideMinutes(o.km) * o.slow;
    delivered(o, Math.max(leave + ride * MIN, routeMsg + MIN), courier);
    free.set(courier.id, o.deliveredAt + ride * 0.6 * MIN);
  }

  // 3b. Livraison par notre équipe : la responsable regroupe les commandes prêtes en même temps (tournées),
  // le restaurant pose « Prête pour livraison », le livreur confirme « Commande récupérée » puis livre
  const runs = [];
  const partnerFree = new Map(partnerCouriers.map((c) => [c.id, 0]));
  const groups = [];
  for (const o of toDeliver('PRESTATAIRE')) {
    const g = groups.at(-1);
    if (g && g.length < 3 && o.readyAt - g[0].readyAt <= 12 * MIN) g.push(o);
    else groups.push([o]);
  }
  for (const g of groups) {
    const courier = [...partnerCouriers].sort((a, b) => partnerFree.get(a.id) - partnerFree.get(b.id) || rng.next() - 0.5)[0];
    const runAt = Math.max(Math.max(...g.map((o) => o.preparedMsgAt)) + rng.minutes(1, 3), g[0].readyAt - rng.minutes(2, 8));
    const run = { id: newId(rng), operator: 'PRESTATAIRE', courier, createdBy: who.mariam, createdAt: runAt };
    runs.push(run);
    for (const o of g) {
      o.actions.push({ at: runAt, kind: 'assign', courier, run });
      o.actions.push({ at: runAt, kind: 'event', type: 'LIVREUR_ASSIGNE', courierName: courier.name, by: who.mariam });
      o.actions.push({ at: o.readyAt, kind: 'status', from: 'EN_PREPARATION', to: 'PRETE_LIVRAISON', by: agentAt(o.readyAt) });
    }
    const pickedAt = Math.max(Math.max(...g.map((o) => o.readyAt)), partnerFree.get(courier.id), runAt) + rng.minutes(2, 8);
    const byManager = rng.chance(0.04);
    let t = pickedAt;
    for (const o of [...g].sort((a, b) => a.km - b.km)) {
      if (byManager) {
        o.actions.push({ at: pickedAt, kind: 'status', from: 'PRETE_LIVRAISON', to: 'EN_LIVRAISON', by: who.mariam, reason: PICKUP_NO_COURIER });
        o.actions.push({ at: pickedAt, kind: 'event', type: 'RECUPEREE_SANS_LIVREUR', courierName: courier.name, by: who.mariam });
      } else {
        o.actions.push({ at: pickedAt, kind: 'status', from: 'PRETE_LIVRAISON', to: 'EN_LIVRAISON', by: courier });
      }
      const routeMsg = pickedAt + routeGap(o, 1, 3);
      o.actions.push({ at: routeMsg, kind: 'event', type: 'MESSAGE_ENVOYE', messageKey: 'EN_ROUTE', by: agentAt(pickedAt) });
      t += (t === pickedAt ? rideMinutes(o.km) * o.slow : rng.between(5, 12)) * MIN;
      t = Math.max(t, routeMsg + MIN);
      delivered(o, t, courier);
    }
    partnerFree.set(courier.id, t + rideMinutes(g.at(-1).km) * 0.6 * MIN);
  }

  // 4. Frais payés par mobile money : vérifiés sur le téléphone marchand (restaurant, ou notre responsable)
  for (const o of records) {
    if (!o.deliveredAt || o.mode !== 'LIVRAISON' || o.feeMethod !== 'MOBILE_MONEY' || feeOf(o) === 0) continue;
    // Les dernières heures : une partie pas encore vérifiée (pour la page Caisse de la démonstration)
    if (o.deliveredAt > nowMs - 20 * HOUR && rng.chance(0.35)) continue;
    const at = o.deliveredAt + rng.minutes(10, 90);
    const by = o.deliveryOperator === 'PRESTATAIRE' ? who.mariam : agentAt(at);
    o.actions.push({ at, kind: 'event', type: 'FRAIS_VERIFIES', amount: feeOf(o), by, verified: true });
  }

  // 5. Espèces remises au restaurant (ou à notre responsable) chaque matin à 7 h et chaque soir à 22 h 45
  const remittances = [];
  const cashOrders = records.filter((o) => o.deliveredAt && o.mode === 'LIVRAISON' && o.feeMethod === 'ESPECES' && feeOf(o) > 0);
  for (let d = 0; !rush && d <= days; d++) {
    for (const minutes of [7 * 60, 22 * 60 + 45]) {
      const moment = firstDay + d * DAY + minutes * MIN;
      if (moment > nowMs) continue;
      for (const courier of [...restaurantCouriers, ...partnerCouriers]) {
        const list = cashOrders.filter((o) => !o.remittance && o.courier?.id === courier.id && o.deliveredAt <= moment);
        if (!list.length) continue;
        // Les dernières 30 heures : un livreur sur trois n'est pas encore passé remettre ses espèces
        if (moment > nowMs - 30 * HOUR && rng.chance(0.35)) continue;
        const at = Math.min(moment + rng.minutes(0, 20), nowMs);
        // Le call center ne touche jamais d'espèces : celles du restaurant sont reçues par le Patron
        const receivedBy = courier.courierTeam === 'PRESTATAIRE' ? who.mariam : who.patron;
        const remittance = { id: newId(rng), courier, receivedBy, operator: courier.courierTeam, createdAt: at, orders: list };
        remittances.push(remittance);
        for (const o of list) {
          o.remittance = remittance;
          o.actions.push({ at, kind: 'remit', remittance });
        }
      }
    }
  }

  // 6. Avis des clients : environ un tiers des commandes livrées, quelques mauvaises notes rappelées
  const reviews = [];
  for (const o of rush ? [] : records) {
    if (!o.deliveredAt || !rng.chance(0.35)) continue;
    const delay = rng.weighted([[[10, 120], 60], [[120, 24 * 60], 30], [[24 * 60, 3 * 24 * 60], 10]]);
    const at = o.deliveredAt + rng.minutes(...delay);
    if (at > nowMs || at > o.deliveredAt + REVIEW_DAYS * DAY) continue;
    const wait = (o.deliveredAt - o.paidAt) / MIN;
    const low = rng.chance(0.05 + (wait > 55 ? 0.25 : 0));
    const pickup = o.mode === 'A_EMPORTER';
    const good = () => rng.weighted([[5, 60], [4, 32], [3, 8]]);
    const r = { callCenterRating: good(), foodRating: good(), deliveryRating: pickup ? null : good() };
    let comment = rng.chance(0.45) ? rng.pick(GOOD_COMMENTS) : null;
    if (low) {
      const which = pickup ? rng.weighted([['food', 6], ['callCenter', 4]]) : rng.weighted([['delivery', 5], ['food', 3], ['callCenter', 2]]);
      r[`${which}Rating`] = rng.int(1, 2);
      comment = rng.chance(0.85) ? rng.pick(LOW_COMMENTS[which]) : null;
    }
    const review = { id: newId(rng), order: o, ...r, comment, lowRating: isLowRating(r), createdAt: at };
    if (review.lowRating && at < nowMs - 18 * HOUR) {
      const cb = Math.min(at + rng.minutes(60, 300), nowMs);
      review.calledBackAt = cb;
      review.calledBackBy = rng.chance(0.3) ? who.patron : agentAt(cb);
      review.calledBackNote = rng.pick(CALLBACK_NOTES);
    }
    reviews.push(review);
  }
  // Toujours 2 ou 3 mauvais avis encore « à rappeler » pour la démonstration : les plus récents
  const lows = reviews.filter((r) => r.lowRating).sort((a, b) => b.createdAt - a.createdAt);
  const keep = Math.min(lows.length, 3);
  for (const r of lows.slice(0, keep)) delete r.calledBackAt;

  // 7. Commandes telles qu'elles sont maintenant (aujourd'hui : certaines encore en cours)
  const orders = records.map((o) => buildOrder(o, nowMs, rng));
  const byId = new Map(orders.map((o) => [o.id, o]));
  return {
    period: { from: new Date(firstDay), now, switchAt: new Date(switchAt), days },
    staff,
    sources,
    zones: zones.map((z) => ({ id: z.id, name: z.name, fee: z.fee, nightFee: z.nightFee, position: z.position, isActive: true })),
    runs: runs.filter((r) => r.createdAt <= nowMs).map((r) => ({
      id: r.id, operator: r.operator, courierId: r.courier.id, courierName: r.courier.name,
      createdById: r.createdBy.id, createdByName: r.createdBy.name, createdAt: new Date(r.createdAt),
    })),
    remittances: remittances.map((r) => ({
      id: r.id, courierId: r.courier.id, courierName: r.courier.name, amount: remitTotal(r.orders.map((o) => ({ deliveryFee: feeOf(o) }))),
      orderCount: r.orders.length, receivedById: r.receivedBy.id, receivedByName: r.receivedBy.name, operator: r.operator, createdAt: new Date(r.createdAt),
    })),
    orders,
    reviews: reviews.filter((r) => byId.get(r.order.id)?.status === 'LIVREE').map((r) => ({
      id: r.id, orderId: r.order.id, callCenterRating: r.callCenterRating, foodRating: r.foodRating, deliveryRating: r.deliveryRating,
      comment: r.comment, lowRating: r.lowRating,
      calledBackAt: r.calledBackAt ? new Date(r.calledBackAt) : null, calledBackById: r.calledBackAt ? r.calledBackBy.id : null,
      calledBackByName: r.calledBackAt ? r.calledBackBy.name : null, calledBackNote: r.calledBackAt ? r.calledBackNote : null,
      createdAt: new Date(r.createdAt),
    })),
    // Coup de feu : les conditions du contrat de la démonstration sont déjà dans dev
    terms: rush ? null : { ...DEMO_TERMS, validFrom: new Date(switchAt), createdByName: TERMS_AUTHOR, createdAt: new Date(switchAt) },
  };
}

// Frais de la commande une fois le paiement confirmé (autre quartier : montant de l'agent)
const feeOf = (o) => (o.deliveryFeeSource === 'A_CONFIRMER' ? o.agentFee : o.deliveryFee);

// La commande à l'instant `nowMs` : seules les étapes déjà passées comptent
function buildOrder(o, nowMs, rng) {
  const done = o.actions.filter((a) => a.at <= nowMs);
  const statuses = done.filter((a) => a.kind === 'status');
  const status = statuses.at(-1).to;
  const assign = done.findLast((a) => a.kind === 'assign');
  const feeSet = done.some((a) => a.type === 'FRAIS_SAISIS');
  const verified = done.find((a) => a.type === 'FRAIS_VERIFIES');
  const remit = done.find((a) => a.kind === 'remit');
  const reachedCode = statuses.some((a) => a.to === 'EN_LIVRAISON' || a.to === 'PRETE');
  const delivery = o.mode === 'LIVRAISON';
  const fee = !delivery ? null : feeSet ? o.agentFee : o.deliveryFee;
  return {
    id: o.id,
    reference: o.reference,
    status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    mode: o.mode,
    shortFlow: o.shortFlow && statuses.some((a) => a.to === 'EN_PREPARATION'),
    language: null,
    deliveryOperator: o.deliveryOperator,
    sourceId: o.source?.id ?? null,
    sourceName: o.source?.name ?? null,
    createdById: o.agent?.id ?? null,
    createdByName: o.agent?.name ?? null,
    paymentMethod: o.paymentMethod,
    paymentPayerPhone: o.paymentPayerPhone,
    latitude: o.latitude ?? null,
    longitude: o.longitude ?? null,
    locationAccuracy: o.locationAccuracy ?? null,
    addressNote: o.addressNote ?? null,
    itemsTotal: o.itemsTotal,
    deliveryFee: fee,
    deliveryFeeSource: !delivery ? null : feeSet ? 'AGENT' : o.deliveryFeeSource,
    deliveryZoneId: o.deliveryZoneId ?? null,
    deliveryZoneName: o.deliveryZoneName ?? null,
    deliveryNightFee: o.deliveryNightFee ?? null,
    deliveryFeeMethod: status === 'LIVREE' && delivery && fee > 0 ? o.feeMethod : null,
    deliveryFeeVerifiedAt: verified ? new Date(verified.at) : null,
    cashRemittanceId: remit?.remittance.id ?? null,
    courierId: assign?.courier.id ?? null,
    courierName: assign?.courier.name ?? null,
    courierAssignedAt: assign ? new Date(assign.at) : null,
    deliveryRunId: assign?.run?.id ?? null,
    deliveryCode: reachedCode ? String(rng.int(0, 9999)).padStart(4, '0') : null,
    deliveryCodeAttempts: 0,
    createdAt: new Date(o.createdAt),
    updatedAt: new Date(done.at(-1).at),
    items: o.lines,
    // Historique et événements, dans l'ordre (même instant : ordre d'écriture du serveur)
    statusChanges: statuses.map((a) => ({
      fromStatus: a.from, toStatus: a.to, reason: a.reason ?? null, staffUserId: a.by?.id ?? null, staffName: a.by?.name ?? null, createdAt: new Date(a.at),
    })),
    events: done.filter((a) => a.kind === 'event').sort((a, b) => a.at - b.at).map((a) => ({
      type: a.type, amount: a.amount ?? null, previousAmount: null, reason: null, courierName: a.courierName ?? null,
      messageKey: a.messageKey ?? null, staffUserId: a.by.id, staffName: a.by.name, createdAt: new Date(a.at),
    })),
  };
}

// ─────────── Vérification : chaque commande rejouée avec les règles de l'espace équipe ───────────
// Renvoie la liste des erreurs (vide = tout est permis), et quelques comptes utiles.
export function checkPlan(plan, products) {
  const errors = [];
  const err = (o, text) => errors.push(`${o.reference ?? o.id} : ${text}`);
  const now = plan.period.now.getTime();
  const night = { startMin: DEMO_NIGHT.nightStartMin, endMin: DEMO_NIGHT.nightEndMin };
  const refs = new Set();
  let pendingThanks = 0;

  for (const o of plan.orders) {
    if (!isDemoOrder(o)) err(o, 'marques « Démo » incomplètes');
    if (refs.has(o.reference)) err(o, 'référence en double');
    refs.add(o.reference);
    if (!isOpenAt(o.createdAt)) err(o, 'commande passée pendant la fermeture');
    if (o.createdAt.getTime() > now) err(o, 'commande dans le futur');

    // Prix : recalculés comme le serveur
    const items = o.items.map((l) => ({
      productId: l.productId, variantId: l.variantId, quantity: l.quantity, ...(l.choice ? { choice: l.choice } : {}),
      ...(l.drinks.length ? { drinks: l.drinks.map((d) => ({ productId: d.productId, quantity: d.quantity })) } : {}),
    }));
    const priced = priceItems(items, products);
    if (priced.itemsTotal !== o.itemsTotal) err(o, `total des plats ${o.itemsTotal} au lieu de ${priced.itemsTotal}`);

    // Frais de la grille : ceux du quartier (plus son supplément la nuit), comme quoteForOrder()
    if (o.deliveryFeeSource === 'QUARTIER') {
      const z = plan.zones.find((x) => x.id === o.deliveryZoneId);
      if (!z || z.name !== o.deliveryZoneName || o.deliveryFee !== z.fee + (o.deliveryNightFee || 0) || (o.deliveryNightFee && o.deliveryNightFee !== z.nightFee)) err(o, 'frais différents de la grille');
    }
    // Supplément de nuit : seulement avec les frais de la grille, pendant la nuit
    const nightTime = isNightTime(night, o.createdAt);
    if (o.deliveryNightFee && (!nightTime || o.deliveryFeeSource !== 'QUARTIER')) err(o, 'supplément de nuit hors de la nuit');
    if (o.deliveryFeeSource === 'QUARTIER' && nightTime && o.deliveryFee > 0 && !o.deliveryNightFee) err(o, 'supplément de nuit oublié');

    // Étapes : chaque passage permis, client prévenu avant l'étape suivante
    const changes = o.statusChanges;
    if (changes[0].toStatus !== 'PAIEMENT_A_VERIFIER' || changes[0].fromStatus !== null) err(o, 'premier statut incorrect');
    const flow = FLOWS[o.mode === 'A_EMPORTER' ? 'A_EMPORTER' : o.deliveryOperator === 'PRESTATAIRE' ? 'PARTENAIRE' : 'LIVRAISON'];
    const state = (at, extra = {}) => ({
      ...o, ...extra,
      statusChanges: changes.filter((c) => c.createdAt.getTime() <= at),
      events: o.events.filter((e) => e.createdAt.getTime() <= at),
    });
    for (let i = 1; i < changes.length; i++) {
      const c = changes[i];
      const at = c.createdAt.getTime();
      const shortcutSecond = c.fromStatus === 'PAYEE' && changes[i - 1].toStatus === 'PAYEE' && changes[i - 1].createdAt.getTime() === at;
      const before = shortcutSecond ? changes[i - 2] : changes[i - 1];
      if (c.fromStatus !== changes[i - 1].toStatus) err(o, `historique décousu à « ${c.toStatus} »`);
      const e = transitionError(c.fromStatus, c.toStatus, c.reason, o.mode, o.deliveryOperator);
      if (e) err(o, e);
      if (c.toStatus !== 'ANNULEE' && !shortcutSecond) {
        // État juste avant ce passage : statut d'avant, événements d'avant
        const n = noticeError(noticeState(state(at - 1, { status: before.toStatus })));
        if (n) err(o, `avant « ${c.toStatus} » : ${n}`);
      }
      if (c.toStatus === 'EN_LIVRAISON' && o.deliveryOperator === 'RESTAURANT' && o.mode === 'LIVRAISON') {
        const e2 = deliveryError(o);
        if (e2) err(o, e2);
      }
      if (c.toStatus === 'EN_LIVRAISON' && o.deliveryOperator === 'PRESTATAIRE') {
        const e3 = pickupError({ ...o, status: 'PRETE_LIVRAISON' }, { byCourier: c.staffUserId === o.courierId, actorId: c.staffUserId, reason: c.reason });
        if (e3) err(o, e3);
      }
      if (c.toStatus === 'LIVREE' && o.mode === 'LIVRAISON') {
        const e4 = feeMethodError({ ...o, status: 'EN_LIVRAISON', deliveryFeeMethod: null }, o.deliveryFeeMethod);
        if (e4) err(o, e4);
        if (c.staffUserId !== o.courierId && (!c.reason || c.reason.length < 3)) err(o, 'livrée par l’agent sans motif');
      }
    }
    if (!flow.includes(o.status) && o.status !== 'ANNULEE') err(o, `statut ${o.status} hors du parcours`);
    if (o.deliveryRunId) {
      const run = plan.runs.find((r) => r.id === o.deliveryRunId);
      const at = run?.createdAt.getTime();
      const statusThen = changes.findLast((c) => c.createdAt.getTime() <= at)?.toStatus;
      if (!run || !ASSIGNABLE.includes(statusThen)) err(o, 'tournée créée à une étape où le livreur ne se choisit pas');
    }
    if (o.status === 'LIVREE' && needsThanks(o)) pendingThanks++;
  }

  // Espèces : chaque remise respecte les règles de la caisse
  for (const r of plan.remittances) {
    const list = plan.orders.filter((o) => o.cashRemittanceId === r.id);
    const e = remitError(list.map((o) => ({ ...o, cashRemittanceId: null })), r.courierId, list.map((o) => o.reference), r.operator);
    if (e) errors.push(`remise ${r.courierName} : ${e}`);
    if (remitTotal(list) !== r.amount || list.length !== r.orderCount) errors.push(`remise ${r.courierName} : montant ou nombre faux`);
    // Le call center ne touche jamais d'espèces
    if (plan.staff?.find((x) => x.id === r.receivedById)?.role === 'OPERATEUR') errors.push(`remise ${r.courierName} : reçue par un agent du call center`);
  }

  // Avis : notes cohérentes, dans les 7 jours après la livraison, jamais dans le futur
  for (const r of plan.reviews) {
    const o = plan.orders.find((x) => x.id === r.orderId);
    if (!o || o.status !== 'LIVREE') errors.push(`avis ${r.id} : commande pas livrée`);
    else {
      const deliveredAt = o.statusChanges.findLast((c) => c.toStatus === 'LIVREE').createdAt.getTime();
      if (r.createdAt.getTime() < deliveredAt || r.createdAt.getTime() > deliveredAt + REVIEW_DAYS * DAY) err(o, 'avis hors délai');
      if ((o.mode === 'A_EMPORTER') !== (r.deliveryRating == null)) err(o, 'note de livraison incohérente');
    }
    if (r.lowRating !== isLowRating(r)) errors.push(`avis ${r.id} : mauvaise note mal marquée`);
    if (r.calledBackAt && !r.lowRating) errors.push(`avis ${r.id} : rappel d’un bon avis`);
    if (r.createdAt.getTime() > now) errors.push(`avis ${r.id} : dans le futur`);
  }
  return { errors, pendingThanks };
}

// ─────────── Résumé pour l'essai à blanc ───────────
const fcfa = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
const DAY_NAMES = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

export function summarize(plan) {
  const o = plan.orders;
  const sales = o.filter((x) => !['PAIEMENT_A_VERIFIER', 'ANNULEE'].includes(x.status));
  const deliveries = o.filter((x) => x.mode === 'LIVRAISON');
  const byDay = new Map();
  for (const x of o) {
    const key = x.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const byHour = Array(24).fill(0);
  for (const x of o) byHour[x.createdAt.getUTCHours()]++;
  const count = (f) => o.filter(f).length;
  const lows = plan.reviews.filter((r) => r.lowRating);
  const today = plan.period.now.toISOString().slice(0, 10);
  return {
    period: `${plan.period.from.toISOString().slice(0, 10)} → ${today} (mode Prestataire à partir du ${plan.period.switchAt.toISOString().slice(0, 10)})`,
    orders: o.length,
    days: [...byDay].map(([d, n]) => `${d} ${DAY_NAMES[new Date(d).getUTCDay()]} : ${n}`),
    byHour,
    sales: { count: sales.length, amount: fcfa(sales.reduce((s, x) => s + x.itemsTotal, 0)), average: fcfa(Math.round(sales.reduce((s, x) => s + x.itemsTotal, 0) / Math.max(1, sales.length))) },
    modes: { livraison: deliveries.length, emporter: count((x) => x.mode === 'A_EMPORTER'), restaurant: count((x) => x.mode === 'LIVRAISON' && x.deliveryOperator === 'RESTAURANT'), prestataire: count((x) => x.mode === 'LIVRAISON' && x.deliveryOperator === 'PRESTATAIRE') },
    sources: { site: count((x) => !x.createdById), appel: count((x) => x.sourceName === DEMO_SOURCES[0].name), whatsapp: count((x) => x.sourceName === DEMO_SOURCES[1].name) },
    payments: Object.fromEntries(['ORANGE_MONEY', 'MOOV_MONEY', 'TELECEL_MONEY'].map((m) => [m, count((x) => x.paymentMethod === m)])),
    cancelled: count((x) => x.status === 'ANNULEE'),
    inProgress: Object.fromEntries(['PAIEMENT_A_VERIFIER', 'PAYEE', 'EN_PREPARATION', 'PRETE_LIVRAISON', 'EN_LIVRAISON', 'PRETE'].map((s) => [s, count((x) => x.status === s)])),
    free: count((x) => x.mode === 'LIVRAISON' && x.deliveryFee === 0),
    night: count((x) => x.deliveryNightFee),
    agentFees: count((x) => x.deliveryFeeSource === 'AGENT' || x.deliveryFeeSource === 'A_CONFIRMER'),
    fees: fcfa(deliveries.filter((x) => x.status === 'LIVREE').reduce((s, x) => s + x.deliveryFee, 0)),
    cash: { especes: count((x) => x.deliveryFeeMethod === 'ESPECES'), mobile: count((x) => x.deliveryFeeMethod === 'MOBILE_MONEY'), remittances: plan.remittances.length, notRemitted: count((x) => x.deliveryFeeMethod === 'ESPECES' && !x.cashRemittanceId), toVerify: count((x) => x.deliveryFeeMethod === 'MOBILE_MONEY' && !x.deliveryFeeVerifiedAt) },
    runs: { count: plan.runs.length, multi: plan.runs.filter((r) => o.filter((x) => x.deliveryRunId === r.id).length > 1).length },
    noCode: count((x) => x.events.some((e) => e.type === 'LIVRAISON_SANS_CODE')),
    pickedByManager: count((x) => x.events.some((e) => e.type === 'RECUPEREE_SANS_LIVREUR')),
    reviews: { count: plan.reviews.length, low: lows.length, calledBack: lows.filter((r) => r.calledBackAt).length, toCall: lows.filter((r) => !r.calledBackAt).length },
    statusChanges: o.reduce((s, x) => s + x.statusChanges.length, 0),
    events: o.reduce((s, x) => s + x.events.length, 0),
    items: o.reduce((s, x) => s + x.items.length, 0),
  };
}
