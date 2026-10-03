import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceLabel, newOrderNotification } from '../src/services/push.message.js';
import { MAX_FAILURES, shouldRemove } from '../src/services/push.service.js';
import { endpointSchema, subscriptionSchema } from '../src/routes/staff-push.routes.js';

test('notification de commande : référence et total en titre, sans données du client', () => {
  const n = newOrderNotification({
    reference: 'BC-7K2Q9M',
    customerName: 'Awa Ouédraogo',
    customerPhone: '+22676123456',
    paymentMethod: 'ORANGE_MONEY',
    itemsTotal: 7500,
    items: [{ quantity: 2 }, { quantity: 1 }],
  });
  assert.equal(n.title, 'Nouvelle commande BC-7K2Q9M · 7 500 F');
  assert.equal(n.body, '3 articles · Orange Money à vérifier');
  assert.equal(n.url, '/equipe/commandes/BC-7K2Q9M');
  assert.equal(n.tag, 'commande-BC-7K2Q9M');
  assert.ok(!JSON.stringify(n).includes('Awa') && !JSON.stringify(n).includes('76123456'));
});

test('un seul article : pas de « s »', () => {
  const n = newOrderNotification({ reference: 'BC-A', paymentMethod: 'MOOV_MONEY', itemsTotal: 2500, items: [{ quantity: 1 }] });
  assert.equal(n.body, '1 article · Moov Money à vérifier');
});

test('téléphone retiré : adresse morte (404, 410) ou trop d’échecs d’affilée', () => {
  assert.equal(shouldRemove(410, 0), true);
  assert.equal(shouldRemove(404, 0), true);
  assert.equal(shouldRemove(500, 0), false);
  assert.equal(shouldRemove(undefined, 0), false); // réseau coupé
  assert.equal(shouldRemove(500, MAX_FAILURES - 2), false);
  assert.equal(shouldRemove(500, MAX_FAILURES - 1), true);
});

test('seules les adresses des services de notification sont acceptées', () => {
  const ok = [
    'https://fcm.googleapis.com/fcm/send/abc:def',
    'https://web.push.apple.com/QGz1',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ];
  for (const u of ok) assert.equal(endpointSchema.safeParse(u).success, true, u);
  const bad = [
    'http://fcm.googleapis.com/fcm/send/abc', // pas https
    'https://exemple.com/fcm.googleapis.com',
    'https://fcm.googleapis.com.exemple.com/x',
    'https://localhost:3006/api',
    'pas une adresse',
  ];
  for (const u of bad) assert.equal(endpointSchema.safeParse(u).success, false, u);
  assert.equal(subscriptionSchema.safeParse({ endpoint: ok[0], keys: { p256dh: 'x' } }).success, false);
  assert.equal(subscriptionSchema.safeParse({ endpoint: ok[0], keys: { p256dh: 'x', auth: 'y' } }).success, true);
});

test('nom lisible du téléphone', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(deviceLabel(''), 'Appareil');
});
