// Lot 8 : langue FR/EN du site client (réglage « Site en anglais », langue notée sur la commande)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentOrderSchema, createOrderSchema } from '../src/validators/order.schema.js';
import { getAppSettings } from '../src/services/app-settings.service.js';
import { featureMap } from '../src/services/features.js';

const base = {
  customer: { name: 'Awa Ouédraogo', phone: '76 12 34 56' },
  payment: { method: 'ORANGE_MONEY', payerPhone: '76123456' },
  addressNote: 'Patte d’Oie, portail bleu',
  items: [{ productId: 'p1', variantId: 'v1', quantity: 2 }],
};

const fakeDb = ({ app = null, closed = [] } = {}) => ({
  appSettings: { findUnique: async () => app },
  featureSwitch: { findMany: async () => closed.map((key) => ({ key, enabled: false })) },
});

test('lot 8 : « Site en anglais » éteint par défaut, sans ligne de réglage', async () => {
  const s = await getAppSettings(fakeDb());
  assert.equal(s.englishSite, false);
  assert.equal(s.included.englishSite, true); // interrupteur ANGLAIS ouvert sans ligne
});

test('lot 8 : allumé par le Patron, éteint quand le Prestataire ferme ANGLAIS', async () => {
  const app = { shortFlow: false, agentOrders: false, englishSite: true };
  assert.equal((await getAppSettings(fakeDb({ app }))).englishSite, true);
  const closed = await getAppSettings(fakeDb({ app, closed: ['ANGLAIS'] }));
  assert.equal(closed.englishSite, false);
  assert.equal(closed.included.englishSite, false);
  // Fermer ANGLAIS ne touche pas les autres réglages
  assert.equal(closed.included.reviewsEnabled, true);
});

test('lot 8 : interrupteur ANGLAIS ouvert sans ligne', () => {
  assert.equal(featureMap([]).ANGLAIS, true);
  assert.equal(featureMap([{ key: 'ANGLAIS', enabled: false }]).ANGLAIS, false);
});

test('lot 8 : la commande du site accepte la langue FR ou EN, absente comme avant', () => {
  assert.equal(createOrderSchema.parse(base).language, undefined);
  assert.equal(createOrderSchema.parse({ ...base, language: 'EN' }).language, 'EN');
  assert.equal(createOrderSchema.parse({ ...base, language: 'FR' }).language, 'FR');
  const r = createOrderSchema.safeParse({ ...base, language: 'DE' });
  assert.equal(r.success, false);
  assert.equal(r.error.issues[0].path.join('.'), 'language');
});

test('lot 8 : une commande saisie par l’agent n’a jamais de langue', () => {
  const o = agentOrderSchema.parse({ ...base, sourceId: 's1', language: 'EN' });
  assert.equal(o.language, undefined);
});
