import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cashByCourier, remitError, remitTotal } from '../src/services/cash.js';

// Caisse : espèces des frais de livraison encore chez les livreurs, et « Espèces remises »
const now = new Date('2026-10-06T18:00:00Z');
const cash = (reference, courierId, fee, deliveredAt, extra = {}) => ({
  reference, courierId, courierName: courierId === 'issa' ? 'Issa' : 'Ali', customerName: 'Client', deliveryFee: fee,
  deliveredAt: new Date(deliveredAt), status: 'LIVREE', deliveryFeeMethod: 'ESPECES', cashRemittanceId: null, ...extra,
});

test('espèces par livreur : total, part du jour, livreurs sans espèces affichés', () => {
  const list = cashByCourier(
    [
      cash('BC-1', 'issa', 500, '2026-10-06T12:00:00Z'),
      cash('BC-2', 'issa', 1000, '2026-10-05T20:00:00Z'), // d'hier, pas encore remis
      cash('BC-3', 'ali', 750, '2026-10-06T09:00:00Z'),
    ],
    [{ id: 'issa', name: 'Issa' }, { id: 'ali', name: 'Ali' }, { id: 'moussa', name: 'Moussa' }],
    now,
  );
  assert.deepEqual(list.map((c) => [c.courierName, c.amount, c.today, c.older]), [['Issa', 1500, 500, 1000], ['Ali', 750, 750, 0], ['Moussa', 0, 0, 0]]);
  assert.deepEqual(list[0].orders.map((o) => o.reference), ['BC-2', 'BC-1']); // le plus ancien d'abord
});

test('espèces remises : seulement les courses en espèces de ce livreur, pas encore remises', () => {
  const ok = [cash('BC-1', 'issa', 500, '2026-10-06T12:00:00Z'), cash('BC-2', 'issa', 1000, '2026-10-06T13:00:00Z')];
  assert.equal(remitError(ok, 'issa', ['BC-1', 'BC-2']), null);
  assert.equal(remitTotal(ok), 1500);
  assert.match(remitError([], 'issa', []), /pas d’espèces/);
  assert.match(remitError(ok.slice(0, 1), 'issa', ['BC-1', 'BC-2']), /a changé/); // une course introuvable
  assert.match(remitError(ok, 'ali', ['BC-1', 'BC-2']), /pas été livrée par ce livreur/);
  assert.match(remitError([{ ...ok[0], deliveryFeeMethod: 'MOBILE_MONEY' }], 'issa', ['BC-1']), /pas été payée en espèces/);
  assert.match(remitError([{ ...ok[0], cashRemittanceId: 'r1' }], 'issa', ['BC-1']), /déjà remises/);
});
