// Démonstration commerciale (scripts/demo-*.js) : garde-fou dev, marques « Démo », plan rejoué avec les règles
// de l'équipe, prix du serveur, volumes réalistes, comparaison des photos. Sans base de données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newOrderReference } from '../src/utils/reference.js';
import { companyReady } from '../src/services/delivery-mode.js';
import { normalizePhone } from '../src/utils/phone.js';
import {
  DEMO_COMPANY, DEMO_REF_RE, DEMO_TERMS, PRESTATAIRE_DEMO, RESTORED_TABLES, comparePhotos, isDemoOrder, isDemoRemittance, isDemoRun,
  isDemoAvailabilityChange, isDemoStaff, isDemoTerms, isDemoZone, isLiveTestOrder, passwordTargetError, serverError, serverNameOf,
} from '../scripts/demo-commun.js';
import { checkPlan, generatePlan, isOpenAt, summarize } from '../scripts/demo-plan.js';

// Menu de test, de la même forme que celui de la base (formules avec boissons, choix, extras, boissons)
let n = 0;
const cat = (slug, extra = {}) => ({ id: `cat-${slug}`, slug, isActive: true, isDrinks: false, ...extra });
const product = (name, category, variants, extra = {}) => {
  const id = `p${++n}`;
  return {
    id, name, number: null, isAvailable: true, archivedAt: null, choices: [], choiceLabel: null, category, ...extra,
    variants: variants.map(([code, price, drinkCount = 0], i) => ({ id: `${id}-v${i}`, code, label: code, price, drinkCount })),
  };
};
const burgers = cat('burgers');
const poulet = cat('poulet');
const buckets = cat('buckets');
const salades = cat('salades');
const extras = cat('extras');
const boissons = cat('boissons', { isDrinks: true });
const PRODUCTS = [
  product('Smoky', burgers, [['seul', 4000], ['menu', 5500, 1]]),
  product('Grill XL', burgers, [['seul', 5000], ['menu', 6500, 1]]),
  product('Magnifique', burgers, [['seul', 5000]], { isAvailable: false }),
  product('Wings 8 pièces', poulet, [['standard', 7500, 1]]),
  product('Chicken Pop Corn', poulet, [['L', 1500], ['XL', 2000]]),
  product('Family Bucket', buckets, [['standard', 28000, 4]]),
  product('Bucket for 2', buckets, [['standard', 13000]]),
  product('Chicken Salad', salades, [['seul', 4000], ['menu', 4500, 1]], { choices: ['Grillé', 'Frit'], choiceLabel: 'Cuisson' }),
  product('Frites', extras, [['L', 1000], ['XL', 1500]]),
  product('Coca-Cola', boissons, [['standard', 1000]]),
  product('Babali (eau)', boissons, [['standard', 500]]),
  product('Malta Tonic', boissons, [['standard', 1250]], { isAvailable: false }),
];
const NOW = new Date('2026-10-12T15:20:00Z');
const plan = generatePlan({ products: PRODUCTS, now: NOW });

test('garde-fou : seulement le serveur dev, jamais la production', () => {
  const dev = 'postgresql://u:p@ep-nameless-band-b4vetndd-pooler.c-2.us-east-2.aws.neon.tech/db';
  const devDirect = 'postgresql://u:p@ep-nameless-band-b4vetndd.c-2.us-east-2.aws.neon.tech/db';
  const prod = 'postgresql://u:p@ep-damp-lab-b44k8hrf-pooler.c-2.us-east-2.aws.neon.tech/db';
  assert.equal(serverNameOf(dev), 'ep-nameless-band-b4vetndd');
  assert.equal(serverError([dev, devDirect]), null);
  assert.match(serverError([prod]), /PRODUCTION/);
  assert.match(serverError([dev, prod]), /PRODUCTION/);
  assert.match(serverError(['postgresql://u:p@localhost/db']), /inconnu/);
  assert.match(serverError(['pas une adresse']), /inconnu/);
});

test('une vraie référence ne ressemble jamais à une référence de démonstration', () => {
  for (let i = 0; i < 5000; i++) assert.equal(DEMO_REF_RE.test(newOrderReference()), false);
});

test('toutes les données portent les marques « Démo », une marque seule ne suffit pas', () => {
  assert.ok(plan.orders.length > 0);
  for (const o of plan.orders) assert.ok(isDemoOrder(o), o.reference);
  for (const s of plan.staff) assert.ok(isDemoStaff(s), s.name);
  for (const r of plan.runs) assert.ok(isDemoRun(r));
  for (const r of plan.remittances) assert.ok(isDemoRemittance(r));
  assert.ok(isDemoTerms(plan.terms));
  const o = plan.orders[0];
  assert.equal(isDemoOrder({ ...o, customerName: 'Awa Ouédraogo' }), false);
  assert.equal(isDemoOrder({ ...o, customerPhone: '+22670123456' }), false);
  assert.equal(isDemoOrder({ ...o, reference: 'BC-7K2Q9M' }), false);
  assert.equal(isDemoStaff({ name: 'Awa (essai)', phone: '+22670970001' }), false);
  assert.equal(isDemoStaff({ name: 'Awa (Démo)', phone: '+22670990001' }), false);
});

test('chaque commande respecte les règles de l’équipe et les prix du serveur', () => {
  const { errors } = checkPlan(plan, PRODUCTS);
  assert.deepEqual(errors, []);
  const prices = new Map(PRODUCTS.flatMap((p) => p.variants.map((v) => [v.id, v.price])));
  for (const o of plan.orders) {
    for (const l of o.items) assert.equal(l.unitPrice, prices.get(l.variantId));
    assert.equal(o.itemsTotal, o.items.reduce((s, l) => s + l.lineTotal, 0));
    assert.ok(o.items.every((l) => l.productId !== PRODUCTS[2].id), 'plat indisponible commandé');
  }
});

test('plan faussé : la vérification le voit', () => {
  const o = plan.orders.find((x) => x.status === 'LIVREE' && x.mode === 'LIVRAISON');
  const bad = { ...plan, orders: [{ ...o, itemsTotal: o.itemsTotal + 500 }] };
  assert.ok(checkPlan(bad, PRODUCTS).errors.some((e) => e.includes('total des plats')));
  const noMsg = { ...plan, orders: [{ ...o, events: o.events.filter((e) => e.messageKey !== 'EN_ROUTE') }] };
  assert.ok(checkPlan(noMsg, PRODUCTS).errors.some((e) => e.includes('Prévenez d’abord le client')));
});

test('volumes réalistes : vendredi et samedi, pointes, annulations, offertes, nuit, tournées, avis', () => {
  const s = summarize(plan);
  const perDay = new Map();
  for (const o of plan.orders.filter((x) => x.createdAt < new Date('2026-10-12T00:00:00Z'))) {
    const d = o.createdAt.toISOString().slice(0, 10);
    perDay.set(d, (perDay.get(d) || 0) + 1);
  }
  const avg = (days) => {
    const list = [...perDay].filter(([d]) => days.includes(new Date(d).getUTCDay())).map(([, c]) => c);
    return list.reduce((a, b) => a + b, 0) / list.length;
  };
  assert.ok(avg([5, 6]) > 1.6 * avg([1, 2, 3]), 'vendredi et samedi bien plus chargés');
  assert.ok(s.orders > 550 && s.orders < 1000, `${s.orders} commandes`);
  assert.ok(s.byHour[12] + s.byHour[13] > 3 * (s.byHour[9] + s.byHour[10]), 'pointe de midi');
  assert.ok(s.byHour[19] + s.byHour[20] > 3 * (s.byHour[16] + s.byHour[15]) / 2, 'pointe du soir');
  assert.ok(s.cancelled / s.orders > 0.01 && s.cancelled / s.orders < 0.08, `${s.cancelled} annulées`);
  assert.ok(s.free > 5, 'livraisons offertes');
  assert.ok(s.runs.multi > 10, 'tournées de plusieurs commandes');
  assert.ok(s.modes.restaurant > 50 && s.modes.prestataire > 200);
  assert.ok(s.sources.appel > 0 && s.sources.whatsapp > 0 && s.sources.site > s.sources.appel);
  assert.ok(s.reviews.low > 3 && s.reviews.calledBack > 0 && s.reviews.toCall >= 2 && s.reviews.toCall <= 3);
  assert.ok(s.cash.remittances > 20 && s.cash.toVerify >= 0);
  for (const o of plan.orders) {
    assert.ok(isOpenAt(o.createdAt), 'commande pendant la fermeture');
    if (o.deliveryNightFee) {
      const d = o.createdAt;
      assert.equal(o.deliveryNightFee, 500);
      assert.ok(d.getUTCHours() >= 23 || d.getUTCHours() < 6);
      assert.ok([5, 6].includes(d.getUTCDay()), 'supplément de nuit seulement les nuits du vendredi et du samedi');
    }
  }
  assert.ok(s.night > 5, 'commandes avec supplément de nuit');
});

test('mode Prestataire : à partir du 11e jour, conditions fictives, codes faux mais valides', () => {
  for (const o of plan.orders) {
    if (o.mode !== 'LIVRAISON') assert.equal(o.deliveryOperator, 'RESTAURANT');
    else assert.equal(o.deliveryOperator, o.createdAt >= plan.period.switchAt ? 'PRESTATAIRE' : 'RESTAURANT');
  }
  assert.equal(plan.terms.validFrom.getTime(), plan.period.switchAt.getTime());
  assert.deepEqual([plan.terms.perDeliveryPrice, plan.terms.freeDeliveryPrice], [DEMO_TERMS.perDeliveryPrice, DEMO_TERMS.freeDeliveryPrice]);
  assert.ok(companyReady(DEMO_COMPANY));
  assert.match(DEMO_COMPANY.companyName, /DÉMO/);
  assert.match(DEMO_COMPANY.merchantName, /DÉMO/);
  for (const code of [DEMO_COMPANY.orangeCode, DEMO_COMPANY.moovCode, DEMO_COMPANY.telecelCode]) assert.match(code, /^\*000\*/);
});

test('rien dans le futur : aujourd’hui, des commandes encore en cours', () => {
  const now = NOW.getTime();
  for (const o of plan.orders) {
    assert.ok(o.updatedAt.getTime() <= now);
    for (const c of [...o.statusChanges, ...o.events]) assert.ok(c.createdAt.getTime() <= now);
  }
  for (const r of [...plan.runs, ...plan.remittances, ...plan.reviews]) assert.ok(r.createdAt.getTime() <= now);
  const s = summarize(plan);
  assert.ok(Object.values(s.inProgress).reduce((a, b) => a + b, 0) > 0, 'commandes en cours');
});

test('même graine, même jour : même démonstration', () => {
  const again = generatePlan({ products: PRODUCTS, now: NOW });
  assert.deepEqual(again.orders.map((o) => [o.reference, o.itemsTotal, o.status]), plan.orders.map((o) => [o.reference, o.itemsTotal, o.status]));
});

test('photos : identiques, différentes, journal de sécurité qui ne fait que grandir', () => {
  const before = { tables: { Order: { count: 7, hash: 'a' }, SecurityLog: { count: 10, hash: 'h' } } };
  const same = { tables: { Order: { count: 7, hash: 'a' }, SecurityLog: { count: 10, hash: 'h', hashUntilPhoto: 'h' } } };
  assert.deepEqual(comparePhotos(before, same), []);
  const grown = { tables: { Order: { count: 7, hash: 'a' }, SecurityLog: { count: 12, hash: 'x', hashUntilPhoto: 'h' } } };
  assert.deepEqual(comparePhotos(before, grown).map((d) => d.allowed), [true]);
  const changed = { tables: { Order: { count: 7, hash: 'b' }, SecurityLog: { count: 10, hash: 'h', hashUntilPhoto: 'z' } } };
  assert.equal(comparePhotos(before, changed).filter((d) => !d.allowed).length, 2);
});

test('les scripts de démonstration n’envoient rien : ni WhatsApp, ni alerte, ni journal', () => {
  for (const f of ['demo-commun.js', 'demo-plan.js', 'demo-photo.js', 'demo-remplir.js', 'demo-effacer.js', 'demo-mot-de-passe.js']) {
    const text = readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    const imports = text.split('\n').filter((l) => /^import /.test(l)).join('\n');
    assert.doesNotMatch(imports, /whatsapp|push|security-log|order\.service|staff-orders|courier\.service|dispatch\.service|cash\.service/i, f);
  }
});

test('grille des frais de la démonstration : quartiers marqués, frais des commandes pris dans la grille', () => {
  assert.ok(plan.zones.length > 10);
  for (const z of plan.zones) assert.ok(isDemoZone(z), z.name);
  assert.equal(isDemoZone({ name: 'Gounghin', position: 3 }), false);
  assert.equal(isDemoZone({ name: 'sarfalao', position: 950 }), false);
  assert.ok(plan.zones.some((z) => z.fee === 0 && z.nightFee === 0), 'quartier offert, sans supplément');
  assert.ok(plan.zones.filter((z) => z.fee > 0).every((z) => z.nightFee === 500));
  const ids = new Set(plan.zones.map((z) => z.id));
  for (const o of plan.orders.filter((x) => x.deliveryFeeSource === 'QUARTIER')) assert.ok(ids.has(o.deliveryZoneId), o.reference);
  assert.ok(plan.orders.every((o) => o.deliveryFeeSource === 'QUARTIER' || o.deliveryZoneId === null));
  for (const model of ['appSettings', 'deliverySettings', 'deliveryCompany', 'featureSwitch', 'deliveryZone', 'deliveryDistanceBand']) {
    assert.ok(RESTORED_TABLES.some((t) => t.model === model), `${model} remis comme avant`);
  }
});

test('compte « Prestataire (Démo) » : numéro réservé, effacé comme les autres comptes « Démo »', () => {
  const phone = normalizePhone(PRESTATAIRE_DEMO.phone);
  assert.ok(isDemoStaff({ name: PRESTATAIRE_DEMO.name, phone }));
  assert.ok(!plan.staff.some((s) => s.phone === phone), 'numéro libre au remplissage');
  assert.equal(isDemoStaff({ name: 'Prestataire (Demo)', phone }), false, 'nom mal tapé : pas effacé par erreur');
});

test('demo:mot-de-passe : seulement les comptes « Démo », jamais le Prestataire ni un vrai compte', () => {
  const mariam = { name: 'Mariam (Démo)', phone: '+22670970008', role: 'RESPONSABLE_LIVRAISON' };
  assert.equal(passwordTargetError(mariam, mariam.phone), null);
  assert.equal(passwordTargetError({ ...mariam, name: 'Rasmané (Démo)', role: 'LIVREUR', phone: '+22670970009' }, '+22670970009'), null);
  assert.match(passwordTargetError({ name: 'Awa (essai)', phone: '+22670990001', role: 'OPERATEUR' }, '+22670990001'), /pas un compte « Démo »/);
  assert.match(passwordTargetError({ name: 'NABI', phone: '+22670970001', role: 'PATRON' }, '+22670970001'), /pas un compte « Démo »/);
  assert.match(passwordTargetError({ name: 'Prestataire (Démo)', phone: '+22670970050', role: 'PRESTATAIRE' }, '+22670970050'), /equipe:prestataire/);
  assert.match(passwordTargetError(null, '+22670970077'), /Aucun compte/);
  assert.match(passwordTargetError(null, null), /invalide/);
});

test('effacement : commandes passées en direct et disponibilités des livreurs « Démo » reconnues', () => {
  const live = { reference: 'BC-7K2Q9M', customerName: 'Test (Démo)', customerPhone: '+22670985555' };
  assert.ok(isLiveTestOrder(live));
  assert.equal(isLiveTestOrder({ ...live, customerName: 'Test' }), false);
  assert.equal(isLiveTestOrder({ ...live, customerPhone: '+22670123456' }), false);
  assert.equal(isLiveTestOrder({ ...live, reference: 'BC-0K2Q9M' }), false, 'une commande générée reste isDemoOrder');
  assert.ok(isDemoAvailabilityChange({ courierName: 'Rasmané (Démo)', byName: 'Mariam (Démo)' }));
  assert.equal(isDemoAvailabilityChange({ courierName: 'Rasmané (Démo)', byName: 'Awa (essai)' }), false);
  assert.equal(isDemoAvailabilityChange({ courierName: 'kader', byName: 'kader' }), false);
});
