import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillCode, invalidCodeSettings, isValidCodeTemplate, paymentCodes } from '../src/services/payment-codes.js';
import { env } from '../src/config/env.js';

test('code marchand : le montant remplace MONTANT', () => {
  assert.equal(fillCode('*144*10*66534483*MONTANT#', 5500), '*144*10*66534483*5500#');
  assert.equal(fillCode('*555*4*1*1050194*MONTANT#', 1000.4), '*555*4*1*1050194*1000#');
});

test('codes officiels par défaut, nom ECOFOOD, 3 opérateurs dans l’ordre', () => {
  const p = paymentCodes(env.payment, 5500);
  assert.equal(p.merchantName, 'ECOFOOD');
  assert.deepEqual(p.operators, [
    { method: 'ORANGE_MONEY', label: 'Orange Money', code: '*144*10*66534483*5500#' },
    { method: 'MOOV_MONEY', label: 'Moov Money', code: '*555*4*1*1050194*5500#' },
    { method: 'TELECEL_MONEY', label: 'Telecel Money', code: '*808*4*1*2331833*5500#' },
  ]);
  // Sans montant : MONTANT reste, le site le remplit
  assert.equal(paymentCodes(env.payment).operators[0].code, '*144*10*66534483*MONTANT#');
  assert.deepEqual(invalidCodeSettings(env.payment), []);
});

test('réglage mal écrit : signalé', () => {
  assert.equal(isValidCodeTemplate('*144*10*66534483#'), false); // sans MONTANT
  assert.equal(isValidCodeTemplate('*144*10*66534483*MONTANT'), false); // sans # final
  assert.equal(isValidCodeTemplate('*144*10*6653 4483*MONTANT#'), false);
  const bad = { merchantName: 'X', codes: { ORANGE_MONEY: '*1*MONTANT#', MOOV_MONEY: '', TELECEL_MONEY: '*3*MONTANT#' } };
  assert.deepEqual(invalidCodeSettings(bad), ['MOOV_MONEY_CODE']);
});
