// Unit tests with no database dependency.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, totp, verifyTotp } from '../src/lib/totp.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { build837P } from '../src/adapters/clearinghouse.js';

describe('TOTP (RFC 6238)', () => {
  test('accepts the current code', async () => {
    const s = generateSecret();
    assert.equal(verifyTotp(s, totp(s)), true);
  });
  test('rejects a wrong code', () => {
    assert.equal(verifyTotp(generateSecret(), '000000'), false);
  });
  test('tolerates one step of clock drift', () => {
    const s = generateSecret();
    assert.equal(verifyTotp(s, totp(s, Date.now() - 30000)), true);
    assert.equal(verifyTotp(s, totp(s, Date.now() + 30000)), true);
  });
  test('rejects codes outside the window', () => {
    const s = generateSecret();
    assert.equal(verifyTotp(s, totp(s, Date.now() - 300000)), false);
  });
  test('rejects malformed input', () => {
    const s = generateSecret();
    for (const bad of ['', 'abcdef', '12345', '1234567', null, undefined])
      assert.equal(verifyTotp(s, bad), false);
  });
});

describe('password hashing', () => {
  test('round-trips a scrypt hash', async () => {
    const h = await hashPassword('CorrectHorseBattery1!');
    assert.ok(h.startsWith('scrypt$'));
    assert.equal((await verifyPassword('CorrectHorseBattery1!', h)).ok, true);
    assert.equal((await verifyPassword('wrong', h)).ok, false);
  });
  test('salts are unique per hash', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });
  test('verifies legacy bcrypt and flags for upgrade', async () => {
    const legacy = '$2a$10$/eVpdNUdxA0dJSjB8smtJOCj/WZY0kwEUW4Uzi5ppXm56PCIdKTUu'; // "Demo1234!"
    const r = await verifyPassword('Demo1234!', legacy);
    assert.equal(r.ok, true);
    assert.equal(r.needsUpgrade, true);
  });
  test('handles missing/garbage stored hashes without throwing', async () => {
    assert.equal((await verifyPassword('x', null)).ok, false);
    assert.equal((await verifyPassword('x', 'nonsense')).ok, false);
  });
});

describe('X12 837P builder', () => {
  const claim = { id: 'abc', rate: 150, dos: '2026-03-04', cpt_codes: ['90837'] };
  const x12 = build837P({
    claim, clientName: 'Rivera Jamie', providerName: 'Casey Clinician',
    providerNpi: '1234567890', payerName: 'Blue Shield'
  });
  test('includes the required segments', () => {
    for (const seg of ['ISA', 'ST*837', 'NM1*85', 'NM1*IL', 'NM1*PR', 'CLM', 'DTP*472', 'SE'])
      assert.ok(x12.includes(seg), `missing segment ${seg}`);
  });
  test('carries the NPI and charge amount', () => {
    assert.ok(x12.includes('1234567890'));
    assert.ok(x12.includes('150'));
  });
  test('emits one SV1 line per CPT code', () => {
    assert.equal(x12.split('\n').filter(l => l.startsWith('SV1')).length, 1);
  });
});
