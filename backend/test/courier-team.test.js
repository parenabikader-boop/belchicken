// Lot 5b : équipes de livreurs, disponibilité, comptes de notre équipe, caisse séparée (règles sans base)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availabilityActive, availabilityError, courierState, courierTeamError, deliveryActionError, deliveryCreateError,
  isDeliveryTeamAccount, toPartnerCourse,
} from '../src/services/courier-team.js';
import { courierAssignError } from '../src/services/courier.js';
import { teamActionError } from '../src/services/team.js';
import { feeOperatorError, remitError } from '../src/services/cash.js';
import { buildDashboard, periodRange } from '../src/services/dashboard.js';
import { getAppSettings } from '../src/services/app-settings.service.js';
import { FEATURE_KEYS } from '../src/services/features.js';

const resto = { id: 'r1', name: 'Kader', role: 'LIVREUR', isActive: true, courierTeam: 'RESTAURANT', availability: 'DISPONIBLE' };
const nous = { id: 'p1', name: 'Issa', role: 'LIVREUR', isActive: true, courierTeam: 'PRESTATAIRE', availability: 'DISPONIBLE' };
const responsable = { id: 'm1', name: 'Moussa', role: 'RESPONSABLE_LIVRAISON', isActive: true };
const prestataire = { id: 'x1', name: 'Presta', role: 'PRESTATAIRE', isActive: true };
const patron = { id: 'b1', name: 'NABI', role: 'PATRON', isActive: true };
const depart = (deliveryOperator) => ({ status: 'EN_PREPARATION', deliveryOperator });

test('avant le lot 5b : livreur et commande sans équipe = restaurant, rien ne change', () => {
  assert.equal(courierAssignError({ status: 'EN_PREPARATION' }, { id: 'l', name: 'Ali', role: 'LIVREUR', isActive: true }), null);
  assert.equal(availabilityActive('RESTAURANT', false), false);
  assert.equal(courierState(resto, 2, false), null); // pas d'état affiché
});

test('une commande ne part qu’avec un livreur de son mode', () => {
  assert.equal(courierAssignError(depart('RESTAURANT'), resto), null);
  assert.equal(courierAssignError(depart('PRESTATAIRE'), nous), null);
  assert.match(courierAssignError(depart('PRESTATAIRE'), resto), /livrée par notre partenaire/);
  assert.match(courierAssignError(depart('RESTAURANT'), nous), /livreur du restaurant/);
  assert.match(courierAssignError({ status: 'EN_LIVRAISON', deliveryOperator: 'PRESTATAIRE', courierId: 'p2' }, resto), /partenaire/);
});

test('livreur en pause : refusé par le serveur quand la disponibilité est active, ignoré sinon', () => {
  const pause = { ...nous, availability: 'EN_PAUSE' };
  assert.match(courierAssignError(depart('PRESTATAIRE'), pause, { active: true }), /Issa est en pause/);
  assert.match(courierTeamError(depart('PRESTATAIRE'), pause, true), /en pause/);
  const restoPause = { ...resto, availability: 'EN_PAUSE' };
  assert.equal(courierAssignError(depart('RESTAURANT'), restoPause, { active: false }), null); // réglage éteint : comme avant
  assert.match(courierAssignError(depart('RESTAURANT'), restoPause, { active: true }), /en pause/);
});

test('disponibilité active : toujours pour notre équipe, pour le restaurant seulement avec le réglage', () => {
  assert.equal(availabilityActive('PRESTATAIRE', false), true);
  assert.equal(availabilityActive('RESTAURANT', false), false);
  assert.equal(availabilityActive('RESTAURANT', true), true);
});

test('« En course » est calculé, « En pause » reste visible', () => {
  assert.equal(courierState(nous, 0, true), 'DISPONIBLE');
  assert.equal(courierState(nous, 1, true), 'EN_COURSE');
  assert.equal(courierState({ ...nous, availability: 'EN_PAUSE' }, 1, true), 'EN_PAUSE');
});

test('qui change la disponibilité de qui', () => {
  const ok = (args) => availabilityError({ to: 'EN_PAUSE', active: true, ...args });
  assert.equal(ok({ actor: nous, target: nous, side: 'self' }), null);
  assert.match(ok({ actor: nous, target: { ...nous, id: 'p2' }, side: 'self' }), /propre disponibilité/);
  assert.equal(ok({ actor: patron, target: resto, side: 'restaurant' }), null);
  assert.match(ok({ actor: patron, target: nous, side: 'restaurant' }), /son responsable/);
  assert.equal(ok({ actor: responsable, target: nous, side: 'livraison' }), null);
  assert.match(ok({ actor: responsable, target: resto, side: 'livraison' }), /fait partie du restaurant/);
  assert.match(ok({ actor: patron, target: resto, side: 'restaurant', active: false }), /n’est pas activée/);
  assert.match(ok({ actor: nous, target: nous, side: 'self', to: 'DISPONIBLE' }), /déjà disponible/);
  assert.match(ok({ actor: patron, target: { ...resto, isActive: false }, side: 'restaurant' }), /désactivé/);
  assert.match(ok({ actor: patron, target: { ...resto, role: 'OPERATEUR' }, side: 'restaurant' }), /introuvable/);
  assert.match(ok({ actor: nous, target: nous, side: 'self', to: 'EN_COURSE' }), /Disponible ou En pause/);
});

test('comptes : seul le Prestataire crée un Responsable livraison ; le Responsable crée nos livreurs', () => {
  assert.equal(deliveryCreateError(prestataire, 'RESPONSABLE_LIVRAISON'), null);
  assert.equal(deliveryCreateError(prestataire, 'LIVREUR'), null);
  assert.equal(deliveryCreateError(responsable, 'LIVREUR'), null);
  assert.match(deliveryCreateError(responsable, 'RESPONSABLE_LIVRAISON'), /Seul le Prestataire/);
  assert.match(deliveryCreateError(responsable, 'OPERATEUR'), /Livreur ou Responsable/);
  assert.match(deliveryCreateError(responsable, 'PATRON'), /Livreur ou Responsable/);
});

test('comptes : le Responsable gère nos livreurs, jamais les autres responsables ni le restaurant', () => {
  assert.equal(deliveryActionError(responsable, nous, 'reset'), null);
  assert.equal(deliveryActionError(responsable, nous, 'deactivate'), null);
  assert.equal(deliveryActionError(responsable, { ...nous, isActive: false }, 'reactivate'), null);
  assert.match(deliveryActionError(responsable, { ...responsable, id: 'm2' }, 'reset'), /Seul le Prestataire/);
  assert.match(deliveryActionError(responsable, responsable, 'reset'), /votre propre compte/);
  assert.match(deliveryActionError(responsable, resto, 'deactivate'), /ne fait pas partie/);
  assert.match(deliveryActionError(responsable, patron, 'deactivate'), /ne fait pas partie/);
  assert.equal(deliveryActionError(prestataire, { ...responsable, id: 'm2' }, 'deactivate'), null);
  assert.match(deliveryActionError(prestataire, nous, 'reactivate'), /déjà actif/);
});

test('page Équipe du Patron : notre équipe de livraison ne s’y modifie pas', () => {
  assert.equal(isDeliveryTeamAccount(nous), true);
  assert.equal(isDeliveryTeamAccount(responsable), true);
  assert.equal(isDeliveryTeamAccount(resto), false);
  assert.match(teamActionError(patron, nous, 'deactivate'), /équipe de livraison de notre partenaire/);
  assert.match(teamActionError(patron, responsable, 'reset'), /équipe de livraison de notre partenaire/);
  assert.equal(teamActionError(patron, resto, 'deactivate'), null); // comme avant
});

test('le Responsable livraison ne voit jamais les ventes : une course = référence, quartier, livreur, frais', () => {
  const order = {
    reference: 'BC-1', status: 'EN_LIVRAISON', deliveryZoneName: 'Gounghin', courierId: 'p1', courierName: 'Issa', courierAssignedAt: new Date(),
    deliveryFee: 1000, deliveryNightFee: null, itemsTotal: 9000, total: 10000, paymentMethod: 'ORANGE_MONEY', paymentPayerPhone: '+22670000000',
    items: [{ productName: 'Finest', lineTotal: 9000 }], deliveryCode: '1234', customerName: 'Awa',
  };
  const course = toPartnerCourse(order);
  assert.deepEqual(Object.keys(course).sort(), ['assignedAt', 'courierId', 'courierName', 'deliveryFee', 'deliveryNightFee', 'deliveryZoneName', 'reference', 'status']);
  const text = JSON.stringify(course);
  for (const secret of ['9000', '10000', 'ORANGE', '1234', 'Finest']) assert.ok(!text.includes(secret), secret);
});

test('caisse séparée : chaque commande dans la caisse de son mode', () => {
  assert.equal(feeOperatorError({ deliveryOperator: 'RESTAURANT' }, 'RESTAURANT'), null);
  assert.equal(feeOperatorError({}, 'RESTAURANT'), null); // commandes d'avant le lot 5
  assert.equal(feeOperatorError({ deliveryOperator: 'PRESTATAIRE' }, 'PRESTATAIRE'), null);
  assert.match(feeOperatorError({ deliveryOperator: 'PRESTATAIRE' }, 'RESTAURANT'), /son responsable qui les vérifie/);
  assert.match(feeOperatorError({ deliveryOperator: 'RESTAURANT' }, 'PRESTATAIRE'), /caisse du restaurant/);
  const cash = (deliveryOperator) => ({ reference: 'BC-9', courierId: 'p1', status: 'LIVREE', deliveryFeeMethod: 'ESPECES', cashRemittanceId: null, deliveryFee: 500, deliveryOperator });
  assert.equal(remitError([cash('PRESTATAIRE')], 'p1', ['BC-9'], 'PRESTATAIRE'), null);
  assert.match(remitError([cash('PRESTATAIRE')], 'p1', ['BC-9'], 'RESTAURANT'), /BC-9.*responsable/);
  assert.match(remitError([cash('RESTAURANT')], 'p1', ['BC-9'], 'PRESTATAIRE'), /caisse du restaurant/);
  assert.equal(remitError([cash(undefined)], 'p1', ['BC-9']), null); // comme avant
});

test('tableau de bord : les frais de notre partenaire comptés à part, jamais dans ceux du restaurant', () => {
  const NOW = new Date('2026-10-10T14:00:00Z');
  const o = (deliveryOperator, deliveryFee, deliveryFeeMethod) => ({
    reference: `BC-${deliveryFee}`, customerName: 'C', createdAt: new Date('2026-10-10T10:00:00Z'), status: 'LIVREE', paymentMethod: 'ORANGE_MONEY',
    itemsTotal: 5000, items: [], deliveryFee, deliveryFeeMethod, deliveryOperator,
  });
  const d = buildDashboard([o('RESTAURANT', 1000, 'ESPECES'), o('PRESTATAIRE', 700, 'MOBILE_MONEY'), o('PRESTATAIRE', 300, 'ESPECES')], periodRange('day', 0, NOW));
  assert.equal(d.summary.deliveryRevenue, 1000);
  assert.equal(d.summary.deliveryCash, 1000);
  assert.equal(d.summary.deliveryMobile, 0);
  assert.equal(d.summary.partnerFees, 1000);
  assert.equal(d.summary.partnerFeesCount, 2);
  assert.equal(d.summary.revenue, 15000); // les plats restent à Belchicken dans les deux modes
});

test('réglage « Tournées et disponibilité » : éteint par défaut, fermé par le Prestataire = éteint', async () => {
  assert.ok(FEATURE_KEYS.includes('TOURNEES_RESTAURANT'));
  const db = (app, closed = []) => ({
    appSettings: { findUnique: async () => app },
    featureSwitch: { findMany: async () => closed.map((key) => ({ key, enabled: false })) },
  });
  assert.equal((await getAppSettings(db(null))).restaurantDispatch, false);
  assert.equal((await getAppSettings(db({ restaurantDispatch: true }))).restaurantDispatch, true);
  const closed = await getAppSettings(db({ restaurantDispatch: true }, ['TOURNEES_RESTAURANT']));
  assert.equal(closed.restaurantDispatch, false);
  assert.equal(closed.included.restaurantDispatch, false);
});
