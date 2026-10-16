// Lots 11 et 12 : réglages « Menu façon borne » (interrupteur MENU_BORNE) et « Nouvelle page Commandes »
// (interrupteur NOUVELLE_PAGE_COMMANDES), éteints par défaut, lus comme le site en anglais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAppSettings, settingsSchema } from '../src/services/app-settings.service.js';
import { featureMap } from '../src/services/features.js';
import { publicSite } from '../src/routes/site.routes.js';

const fakeDb = ({ app = null, closed = [] } = {}) => ({
  appSettings: { findUnique: async () => app },
  featureSwitch: { findMany: async () => closed.map((key) => ({ key, enabled: false })) },
});

test('lots 11 et 12 : les deux réglages éteints par défaut, sans ligne de réglage', async () => {
  const s = await getAppSettings(fakeDb());
  assert.equal(s.kioskMenu, false);
  assert.equal(s.newOrdersPage, false);
  assert.equal(s.included.kioskMenu, true); // interrupteur MENU_BORNE ouvert sans ligne
  assert.equal(s.included.newOrdersPage, true); // interrupteur NOUVELLE_PAGE_COMMANDES ouvert sans ligne
});

test('lots 11 et 12 : ligne de réglage d’avant la migration (sans les colonnes) = éteints', async () => {
  const s = await getAppSettings(fakeDb({ app: { shortFlow: true, agentOrders: false, englishSite: true } }));
  assert.equal(s.kioskMenu, false);
  assert.equal(s.newOrdersPage, false);
  assert.equal(s.shortFlow, true);
  assert.equal(s.englishSite, true);
});

test('lot 11 : allumé par le Patron, éteint quand le Prestataire ferme MENU_BORNE', async () => {
  const app = { shortFlow: true, kioskMenu: true, newOrdersPage: true };
  assert.equal((await getAppSettings(fakeDb({ app }))).kioskMenu, true);
  const closed = await getAppSettings(fakeDb({ app, closed: ['MENU_BORNE'] }));
  assert.equal(closed.kioskMenu, false);
  assert.equal(closed.included.kioskMenu, false);
  // Fermer MENU_BORNE ne touche pas les autres réglages
  assert.equal(closed.newOrdersPage, true);
  assert.equal(closed.shortFlow, true);
});

test('lot 12 : allumé par le Patron, éteint quand le Prestataire ferme NOUVELLE_PAGE_COMMANDES', async () => {
  const app = { shortFlow: true, kioskMenu: true, newOrdersPage: true };
  assert.equal((await getAppSettings(fakeDb({ app }))).newOrdersPage, true);
  const closed = await getAppSettings(fakeDb({ app, closed: ['NOUVELLE_PAGE_COMMANDES'] }));
  assert.equal(closed.newOrdersPage, false);
  assert.equal(closed.included.newOrdersPage, false);
  assert.equal(closed.kioskMenu, true);
  assert.equal(closed.shortFlow, true);
});

test('lots 11 et 12 : interrupteurs ouverts sans ligne, fermables', () => {
  const open = featureMap([]);
  assert.equal(open.MENU_BORNE, true);
  assert.equal(open.NOUVELLE_PAGE_COMMANDES, true);
  const closed = featureMap([{ key: 'MENU_BORNE', enabled: false }, { key: 'NOUVELLE_PAGE_COMMANDES', enabled: false }]);
  assert.equal(closed.MENU_BORNE, false);
  assert.equal(closed.NOUVELLE_PAGE_COMMANDES, false);
});

test('lots 11 et 12 : le Patron envoie oui ou non, rien d’autre', () => {
  assert.deepEqual(settingsSchema.parse({ kioskMenu: true }), { kioskMenu: true });
  assert.deepEqual(settingsSchema.parse({ newOrdersPage: false }), { newOrdersPage: false });
  assert.equal(settingsSchema.safeParse({ kioskMenu: 'oui' }).success, false);
  assert.equal(settingsSchema.safeParse({ newOrdersPage: 1 }).success, false);
});

test('GET /api/site : seulement anglais et menuBorne, jamais les réglages de l’équipe', async () => {
  assert.deepEqual(publicSite(await getAppSettings(fakeDb())), { anglais: false, menuBorne: false });
  const app = { shortFlow: true, agentOrders: true, englishSite: true, kioskMenu: true, newOrdersPage: true, updatedByName: 'NABI' };
  assert.deepEqual(publicSite(await getAppSettings(fakeDb({ app }))), { anglais: true, menuBorne: true });
  assert.deepEqual(publicSite(await getAppSettings(fakeDb({ app, closed: ['MENU_BORNE'] }))), { anglais: true, menuBorne: false });
});

// Lot « Commande simplifiée » : /api/site ne dit rien de plus tant que l'interrupteur est fermé
test('commande simplifiée : fermée sans ligne ; /api/site exactement comme avant tant qu’elle est fermée', async () => {
  const { publicSite } = await import('../src/routes/site.routes.js');
  const { featureMap, SIMPLE_ORDER } = await import('../src/services/features.js');
  assert.equal(SIMPLE_ORDER, 'COMMANDE_SIMPLIFIEE');
  assert.equal(featureMap([])[SIMPLE_ORDER], false);
  const settings = { englishSite: true, kioskMenu: false };
  assert.deepEqual(publicSite(settings, featureMap([])), { anglais: true, menuBorne: false });
  assert.deepEqual(publicSite(settings), { anglais: true, menuBorne: false });
  assert.deepEqual(publicSite(settings, featureMap([{ key: SIMPLE_ORDER, enabled: true }])), { anglais: true, menuBorne: false, commandeSimple: true });
});

test('commande simplifiée : une livraison sans position est refusée (fermée : comme avant ; à récupérer et agent : jamais)', async () => {
  const { positionRequiredError, POSITION_REQUIRED } = await import('../src/services/simple-order.js');
  const at = { latitude: 12.37, longitude: -1.53 };
  // Fermée : rien ne change
  assert.equal(positionRequiredError({ mode: 'LIVRAISON', location: undefined, simpleOpen: false }), null);
  // Ouverte
  assert.equal(positionRequiredError({ mode: 'LIVRAISON', location: undefined, simpleOpen: true }), POSITION_REQUIRED);
  assert.equal(positionRequiredError({ mode: 'LIVRAISON', location: at, simpleOpen: true }), null);
  assert.equal(positionRequiredError({ mode: 'A_EMPORTER', location: undefined, simpleOpen: true }), null);
  assert.equal(positionRequiredError({ mode: 'LIVRAISON', location: undefined, byAgent: true, simpleOpen: true }), null);
});
