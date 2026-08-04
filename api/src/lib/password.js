// Password hashing with scrypt (memory-hard, built into Node — no dependency),
// with transparent verification of legacy bcrypt hashes and upgrade-on-login.
//
// Format: scrypt$N$r$p$saltB64$hashB64
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const N = 2 ** 15, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise((resolve, reject) =>
    crypto.scrypt(plain, salt, KEYLEN, { N, r, p, maxmem: 256 * 1024 * 1024 },
      (err, dk) => err ? reject(err) : resolve(dk)));
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(plain, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };

  // legacy bcrypt hashes from earlier seeds
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    const ok = await bcrypt.compare(plain, stored);
    return { ok, needsUpgrade: ok };   // re-hash with scrypt on successful login
  }

  const [scheme, sN, sr, sp, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return { ok: false, needsUpgrade: false };

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await new Promise((resolve, reject) =>
    crypto.scrypt(plain, salt, expected.length,
      { N: +sN, r: +sr, p: +sp, maxmem: 256 * 1024 * 1024 },
      (err, dk) => err ? reject(err) : resolve(dk)));

  const ok = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  return { ok, needsUpgrade: false };
}
