// Lot 5c : preuves protégées. Vérifie, sans base de données, que la règle de la migration refuse seulement
// les MODIFICATIONS de l'historique des commandes, jamais les suppressions (nettoyage des commandes d'essai),
// et que la suppression d'une commande emporte bien son historique. L'essai sur une vraie base (dev) :
// npm run test:db (test-db/order-history.db.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../prisma/migrations/20261010200000_livraison_tournees_5c/migration.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const model = (name) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))[0];

test('preuves : la base refuse les modifications de l’historique, sur les deux tables', () => {
  assert.match(migration, /CREATE TRIGGER "OrderStatusChange_no_update"\s+BEFORE UPDATE ON "OrderStatusChange"/);
  assert.match(migration, /CREATE TRIGGER "OrderEvent_no_update"\s+BEFORE UPDATE ON "OrderEvent"/);
});

test('preuves : les suppressions ne sont jamais bloquées (nettoyage des commandes d’essai)', () => {
  const triggers = migration.match(/CREATE TRIGGER[\s\S]*?;/g);
  assert.equal(triggers.length, 2);
  for (const t of triggers) {
    assert.doesNotMatch(t, /DELETE|TRUNCATE/, t);
    assert.match(t, /BEFORE UPDATE ON/);
  }
});

test('preuves : seule exception, un compte supprimé vide le lien staffUserId (le reste identique)', () => {
  assert.match(migration, /OLD\."staffUserId" IS NOT NULL AND NEW\."staffUserId" IS NULL/);
  assert.match(migration, /\(to_jsonb\(NEW\) - 'staffUserId'\) = \(to_jsonb\(OLD\) - 'staffUserId'\)/);
});

test('une commande supprimée emporte son historique (lien en cascade)', () => {
  for (const name of ['OrderStatusChange', 'OrderEvent']) {
    assert.match(model(name), /order\s+Order\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Cascade\)/, name);
    assert.match(model(name), /staffUser\s+StaffUser\?\s+@relation\(fields: \[staffUserId\], references: \[id\], onDelete: SetNull\)/, name);
  }
});

test('la migration n’écrit ni ne modifie aucune ligne', () => {
  const sql = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
});
