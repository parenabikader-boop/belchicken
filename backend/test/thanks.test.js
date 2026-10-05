import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsThanks, THANKS_SINCE } from '../src/services/customer-messages.js';
import { deliveredNotification } from '../src/services/push.message.js';

// Livrées · à remercier : une commande livrée y reste tant que le remerciement n'est pas confirmé
const at = (hhmm, day = '05') => new Date(`2026-10-${day}T${hhmm}:00Z`);
const delivered = (events = [], day = '05') => ({
  status: 'LIVREE',
  statusChanges: [{ toStatus: 'EN_LIVRAISON', createdAt: at('14:00', day) }, { toStatus: 'LIVREE', createdAt: at('14:32', day) }],
  events,
});

test('à remercier : livrée et remerciement pas encore confirmé', () => {
  assert.equal(needsThanks(delivered()), true);
  // WhatsApp ouvert ne suffit pas
  assert.equal(needsThanks(delivered([{ type: 'MESSAGE_PREPARE', messageKey: 'LIVREE', createdAt: at('14:33') }])), true);
});

test('à remercier : passe dans l’historique une fois le remerciement confirmé, par WhatsApp ou par appel', () => {
  assert.equal(needsThanks(delivered([{ type: 'MESSAGE_ENVOYE', messageKey: 'LIVREE', createdAt: at('14:34') }])), false);
  assert.equal(needsThanks(delivered([{ type: 'CLIENT_APPELE', messageKey: 'LIVREE', createdAt: at('14:34') }])), false);
  // La confirmation d'une autre étape ne compte pas
  assert.equal(needsThanks(delivered([{ type: 'MESSAGE_ENVOYE', messageKey: 'EN_ROUTE', createdAt: at('14:01') }])), true);
});

test('à remercier : rien avec l’envoi automatique, ni pour les autres statuts', () => {
  assert.equal(needsThanks(delivered(), { auto: true }), false);
  assert.equal(needsThanks({ ...delivered(), status: 'EN_LIVRAISON' }), false);
  assert.equal(needsThanks({ ...delivered(), status: 'ANNULEE' }), false);
});

test('à remercier : les livraisons d’avant cette étape restent dans l’historique', () => {
  assert.equal(THANKS_SINCE.toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(needsThanks(delivered([], '04')), false);
});

test('notification « livrée » : livreur, heure, et ce qu’il reste à faire', () => {
  const n = deliveredNotification({ reference: 'BC-7K2Q9M' }, { courierName: 'Issa', at: at('14:32') });
  assert.equal(n.title, 'Commande BC-7K2Q9M livrée par Issa à 14 h 32');
  assert.match(n.body, /^Remerciez le client sur WhatsApp/);
  assert.equal(n.url, '/equipe/commandes/BC-7K2Q9M');
  const sansCode = deliveredNotification({ reference: 'BC-7K2Q9M' }, { courierName: 'Issa', at: at('14:32'), byAgent: 'Awa' });
  assert.match(sansCode.body, /^Validée sans code par Awa\. Remerciez/);
  const auto = deliveredNotification({ reference: 'BC-7K2Q9M' }, { courierName: null, at: at('09:05'), auto: true });
  assert.equal(auto.title, 'Commande BC-7K2Q9M livrée à 09 h 05');
  assert.match(auto.body, /envoyé automatiquement/);
});
