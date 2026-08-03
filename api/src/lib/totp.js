// RFC 6238 TOTP — no external dependencies (crypto built-in).
import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(s) {
  let bits = 0, val = 0;
  const out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totp(secret, timeMs = Date.now(), stepSec = 30) {
  const counter = Math.floor(timeMs / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}

// ±1 time-step window tolerates clock drift
export function verifyTotp(secret, code, window = 1) {
  if (!/^\d{6}$/.test(code || '')) return false;
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    if (crypto.timingSafeEqual(Buffer.from(totp(secret, now + w * 30000)), Buffer.from(code))) return true;
  }
  return false;
}

export function otpauthUri({ secret, email, issuer = 'ClinicOS' }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}
