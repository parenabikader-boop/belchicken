import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPrintAsked, isCallCenterLight, printSlip, slipPrintUrl } from './print-slip.js';

test('call center allégé : ouvert seulement si le serveur dit explicitement oui', () => {
  assert.equal(isCallCenterLight({ CALL_CENTER_ALLEGE: true }), true);
  for (const f of [undefined, null, {}, { CALL_CENTER_ALLEGE: false }, { CALL_CENTER_ALLEGE: 'true' }]) assert.equal(isCallCenterLight(f), false);
});

test('bon imprimé avec « Paiement vérifié » : ticket 80 mm, impression demandée', () => {
  assert.equal(slipPrintUrl('BC-ABC123'), '/equipe/commandes/BC-ABC123/bon?format=80&imprimer=1');
  assert.equal(slipPrintUrl('BC-ABC123', 'a4'), '/equipe/commandes/BC-ABC123/bon?format=a4&imprimer=1');
  assert.equal(slipPrintUrl('BC-ABC123', 'x'), '/equipe/commandes/BC-ABC123/bon?format=80&imprimer=1');
  assert.equal(slipPrintUrl('BC/1?'), '/equipe/commandes/BC%2F1%3F/bon?format=80&imprimer=1');
  assert.equal(autoPrintAsked(new URLSearchParams('format=80&imprimer=1')), true);
  assert.equal(autoPrintAsked(new URLSearchParams('format=80')), false); // le bouton « Bon 80 mm » : comme avant
});

test('le bon s’imprime depuis un cadre invisible (pas de nouvel onglet)', () => {
  const added = [];
  const frame = { style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, remove() {} };
  const doc = { createElement: (tag) => (assert.equal(tag, 'iframe'), frame), body: { appendChild: (f) => added.push(f) } };
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    printSlip('BC-ABC123', { doc });
  } finally {
    globalThis.setTimeout = realTimeout;
  }
  assert.equal(added[0], frame);
  assert.equal(frame.src, '/equipe/commandes/BC-ABC123/bon?format=80&imprimer=1');
  assert.equal(frame.attrs['aria-hidden'], 'true');
  assert.equal(frame.style.width, '0');
  assert.equal(frame.style.position, 'fixed');
});
