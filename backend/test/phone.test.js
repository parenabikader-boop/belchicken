import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/utils/phone.js';

test('normalise les formats burkinabè courants', () => {
  for (const v of ['76123456', '76 12 34 56', '22676123456', '+226 76 12 34 56', '0022676123456']) {
    assert.equal(normalizePhone(v), '+22676123456', v);
  }
});

test('refuse les numéros invalides', () => {
  for (const v of ['', '123', '7612345', 'abc', '+226 7612']) assert.equal(normalizePhone(v), null, v);
});

test('accepte un numéro étranger au format international', () => {
  assert.equal(normalizePhone('+225 07 07 07 07 07'), '+2250707070707');
});
