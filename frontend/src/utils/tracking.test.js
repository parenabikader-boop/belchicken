import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertsSupport, CURRENT_MAX_MS, keyBytes, keyFor, readCurrent, saveCurrent, showCurrentBanner, trackingUrl } from './tracking.js';

const KEY = 'AbCdEfGhIjKlMnOpQrStUv12';
const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

test('lien de suivi : référence et clé', () => {
  assert.equal(trackingUrl('https://site', 'BC-7K2Q9M', KEY), `https://site/suivi/BC-7K2Q9M?cle=${KEY}`);
});

test('clé : celle de l’adresse, sinon celle gardée pour cette commande seulement', () => {
  const current = { reference: 'BC-7K2Q9M', key: KEY };
  assert.equal(keyFor('BC-7K2Q9M', new URLSearchParams(`cle=${KEY}`), null), KEY);
  assert.equal(keyFor('BC-7K2Q9M', new URLSearchParams(''), current), KEY);
  assert.equal(keyFor('BC-AUTRE1', new URLSearchParams(''), current), null);
  assert.equal(keyFor('BC-7K2Q9M', new URLSearchParams('cle=<script>'), null), null);
  assert.equal(keyFor('BC-7K2Q9M', new URLSearchParams(''), null), null); // suivi éteint : rien de gardé
});

test('commande en cours gardée sur le téléphone : 24 heures, jusqu’à la fin de la commande', () => {
  const s = memory();
  assert.equal(readCurrent(s), null);
  saveCurrent({ reference: 'BC-7K2Q9M', key: KEY }, s, 1000);
  assert.equal(readCurrent(s, 2000).active, true);
  assert.equal(readCurrent(s, 1000 + CURRENT_MAX_MS).active, false);
  saveCurrent({ reference: 'BC-7K2Q9M', key: KEY, status: 'EN_LIVRAISON' }, s, 5000);
  assert.equal(readCurrent(s, 6000).at, 1000); // même commande : l'heure de départ ne change pas
  saveCurrent({ reference: 'BC-7K2Q9M', key: KEY, status: 'LIVREE' }, s, 7000);
  assert.equal(readCurrent(s, 8000).active, false);
  saveCurrent({ reference: 'BC-NOUVEL', key: KEY }, s, 9000); // nouvelle commande : de nouveau active
  assert.equal(readCurrent(s, 9500).active, true);
  // Données abîmées ou stockage bloqué : rien, sans erreur
  const broken = { getItem: () => '{pas du json', setItem: () => { throw new Error('bloqué'); } };
  assert.equal(readCurrent(broken), null);
  assert.equal(saveCurrent({ reference: 'BC-7K2Q9M', key: KEY }, broken), null);
  assert.equal(readCurrent(null), null);
});

test('bandeau « Votre commande en cours » : ailleurs que sur le suivi et la commande', () => {
  const current = { active: true };
  assert.equal(showCurrentBanner(current, '/'), true);
  assert.equal(showCurrentBanner(current, '/menu'), true);
  assert.equal(showCurrentBanner(current, '/suivi/BC-7K2Q9M'), false);
  assert.equal(showCurrentBanner(current, '/confirmation/BC-7K2Q9M'), false);
  assert.equal(showCurrentBanner(current, '/valider'), false);
  assert.equal(showCurrentBanner({ active: false }, '/'), false);
  assert.equal(showCurrentBanner(null, '/'), false);
});

test('alertes : iPhone hors écran d’accueil = l’ajouter d’abord ; sinon repli sur la page qui se met à jour', () => {
  assert.equal(alertsSupport({ hasPush: true, ios: false, standalone: false, permission: 'default' }), 'ok');
  assert.equal(alertsSupport({ hasPush: false, ios: true, standalone: false, permission: 'default' }), 'ios-install');
  assert.equal(alertsSupport({ hasPush: true, ios: true, standalone: true, permission: 'default' }), 'ok');
  assert.equal(alertsSupport({ hasPush: false, ios: false, standalone: false, permission: 'default' }), 'unsupported');
  assert.equal(alertsSupport({ hasPush: true, ios: false, standalone: false, permission: 'denied' }), 'denied');
});

test('clé publique des alertes : base64 « url » en octets', () => {
  assert.deepEqual([...keyBytes('AQID')], [1, 2, 3]);
  assert.deepEqual([...keyBytes('-_8')], [251, 255]);
});
