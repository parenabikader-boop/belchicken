import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSED_RETRIES, READ_OPERATIONS, isClosedConnection, isConnectionError, withDbRetry, withLongTimeouts } from '../src/lib/db-retry.js';

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

const closed = () => Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });

test('lecture : connexions fermées par Neon (P1017) réessayées tout de suite, en nombre limité', async () => {
  let calls = 0;
  const result = await withDbRetry(async () => {
    calls++;
    if (calls <= 5) throw closed(); // 5 connexions coupées dans le pool
    return 'ok';
  }, { delays: [60000], read: true }); // aucune attente : le test finirait sinon après 1 min
  assert.equal(result, 'ok');
  assert.equal(calls, 6);

  let again = 0;
  await assert.rejects(withDbRetry(async () => { again++; throw closed(); }, { ...noWait, read: true }), { code: 'P1017' });
  assert.equal(again, CLOSED_RETRIES + 1);
});

test('enregistrement : connexion fermée (P1017) jamais réessayée', async () => {
  let calls = 0;
  await assert.rejects(withDbRetry(async () => { calls++; throw closed(); }, noWait), { code: 'P1017' });
  assert.equal(calls, 1);
});

test('lecture : la base qui dort reste réessayée comme avant, en plus de la coupure', async () => {
  let calls = 0;
  const result = await withDbRetry(async () => {
    calls++;
    if (calls <= CLOSED_RETRIES) throw closed();
    if (calls < CLOSED_RETRIES + 4) throw Object.assign(new Error('timeout'), { code: 'P1001' });
    return 'ok';
  }, { ...noWait, read: true });
  assert.equal(result, 'ok');
  assert.equal(calls, CLOSED_RETRIES + 4);
});

test('seules les lectures sont dans la liste des opérations réessayées après P1017', () => {
  for (const op of ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy']) assert.ok(READ_OPERATIONS.has(op), op);
  for (const op of ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', '$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe']) {
    assert.equal(READ_OPERATIONS.has(op), false, op);
  }
});

test("P1017 n'est pas une base injoignable (pas réessayée sans read)", () => {
  assert.equal(isClosedConnection(closed()), true);
  assert.equal(isClosedConnection({ errorCode: 'P1017' }), true);
  assert.equal(isConnectionError(closed()), false);
});
