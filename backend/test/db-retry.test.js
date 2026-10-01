import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConnectionError, withDbRetry, withLongTimeouts } from '../src/lib/db-retry.js';

const noWait = { delays: [0, 0, 0] };

test('réessaie tant que la base dort, puis renvoie le résultat', async () => {
  let calls = 0;
  const result = await withDbRetry(async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    return 'ok';
  }, noWait);
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('abandonne après le dernier essai', async () => {
  let calls = 0;
  await assert.rejects(
    withDbRetry(async () => {
      calls++;
      throw Object.assign(new Error('timeout'), { code: 'P1002' });
    }, noWait),
    { code: 'P1002' },
  );
  assert.equal(calls, 4);
});

test('ne réessaie pas les autres erreurs (ex. référence déjà prise)', async () => {
  let calls = 0;
  await assert.rejects(
    withDbRetry(async () => {
      calls++;
      throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    }, noWait),
    { code: 'P2002' },
  );
  assert.equal(calls, 1);
});

test("reconnaît l'erreur de démarrage du client Prisma", () => {
  const err = new Error("Can't reach database server");
  err.name = 'PrismaClientInitializationError';
  assert.equal(isConnectionError(err), true);
  assert.equal(isConnectionError(new Error('autre')), false);
});

test("allonge les délais de connexion sans écraser ceux de l'URL", () => {
  const u = new URL(withLongTimeouts('postgresql://u:p@hote.neon.tech/db?sslmode=require'));
  assert.equal(u.searchParams.get('connect_timeout'), '20');
  assert.equal(u.searchParams.get('pool_timeout'), '30');
  assert.equal(u.searchParams.get('sslmode'), 'require');
  const kept = new URL(withLongTimeouts('postgresql://u:p@hote/db?connect_timeout=5'));
  assert.equal(kept.searchParams.get('connect_timeout'), '5');
});
