import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool, withTenant } from '../db.js';
import { signAccess, signRefresh, requireAuth } from '../middleware/auth.js';
import { generateSecret, verifyTotp, otpauthUri } from '../lib/totp.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { authLimiter } from '../middleware/security.js';
import { config } from '../config.js';
import crypto from 'crypto';

const r = Router();
const SECRET = config.jwtSecret;

// brute-force protection on every credential-accepting endpoint
r.use(['/login', '/mfa/complete', '/signup', '/forgot', '/reset'], authLimiter);

// ---------- practice self-signup (SaaS front door) ----------
r.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT code, name, price_per_seat, max_clinicians, features FROM plans WHERE active ORDER BY price_per_seat`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/signup', async (req, res, next) => {
  try {
    const { practiceName, subdomain, fullName, email, password, plan = 'professional' } = req.body || {};
    if (!practiceName || !subdomain || !fullName || !email || !password)
      return res.status(400).json({ error: 'practice name, subdomain, your name, email and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
    if (!/^[a-z0-9-]{3,30}$/i.test(subdomain))
      return res.status(400).json({ error: 'subdomain must be 3-30 letters, numbers or hyphens' });

    const hash = await hashPassword(password);
    try {
      const { rows } = await pool.query(
        'SELECT * FROM signup_practice($1,$2,$3,$4,$5,$6)',
        [practiceName, subdomain, fullName, email, hash, plan]);
      const user = await lookup(subdomain.toLowerCase(), email);
      issueTokens(user, res);
    } catch (e) {
      if (/subdomain already taken/.test(e.message))
        return res.status(409).json({ error: 'that clinic address is already taken' });
      throw e;
    }
  } catch (e) { next(e); }
});

// ---------- forgot / reset password ----------
r.post('/forgot', async (req, res, next) => {
  try {
    const { email, subdomain = 'demo' } = req.body || {};
    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query('SELECT * FROM request_password_reset($1,$2,$3)', [subdomain, email, token]);
    // never reveal whether the account exists
    const payload = { ok: true, message: 'If that account exists, a reset link has been sent.' };
    // dev convenience: surface the link when not in production
    if (rows[0]?.found && process.env.NODE_ENV !== 'production') payload.devResetToken = token;
    res.json(payload);
  } catch (e) { next(e); }
});

r.post('/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || password.length < 8)
      return res.status(400).json({ error: 'token and a password of at least 8 characters are required' });
    const hash = await hashPassword(password);
    const { rows } = await pool.query('SELECT consume_password_reset($1,$2) AS ok', [token, hash]);
    if (!rows[0].ok) return res.status(400).json({ error: 'that reset link is invalid or expired' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function lookup(subdomain, email) {
  const { rows } = await pool.query('SELECT * FROM auth_login_lookup($1, $2)', [subdomain, email]);
  return rows[0];
}

function issueTokens(user, res) {
  res.json({
    accessToken: signAccess(user),
    refreshToken: signRefresh(user),
    user: { id: user.id, name: user.full_name, role: user.role, email: user.email, mfaEnabled: user.mfa_enabled }
  });
}

// Step 1: password. If MFA enrolled → return short-lived mfa token instead of access.
r.post('/login', async (req, res, next) => {
  try {
    const { email, password, subdomain = 'demo' } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await lookup(subdomain, email);
    if (!user) {
      // constant-ish work so response timing doesn't reveal whether the account exists
      await verifyPassword(password, 'scrypt$32768$8$1$AAAA$AAAA');
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const { ok, needsUpgrade } = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    // silently migrate legacy bcrypt hashes to scrypt on successful login
    if (needsUpgrade) {
      const fresh = await hashPassword(password);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [fresh, user.id])
        .catch(() => {});
    }

    if (config.requireMfaForStaff && !user.mfa_enabled) {
      return res.status(403).json({ error: 'this practice requires two-factor authentication — contact your administrator to enrol' });
    }

    if (user.mfa_enabled) {
      const mfaToken = jwt.sign({ typ: 'mfa', email, subdomain }, SECRET, { expiresIn: '5m' });
      return res.json({ mfaRequired: true, mfaToken });
    }
    issueTokens(user, res);
  } catch (e) { next(e); }
});

// Step 2: TOTP code completes login
r.post('/mfa/complete', async (req, res, next) => {
  try {
    const { mfaToken, code } = req.body || {};
    let claims;
    try { claims = jwt.verify(mfaToken || '', SECRET); } catch { return res.status(401).json({ error: 'expired — log in again' }); }
    if (claims.typ !== 'mfa') return res.status(401).json({ error: 'invalid token' });

    const user = await lookup(claims.subdomain, claims.email);
    if (!user?.mfa_secret || !verifyTotp(user.mfa_secret, code))
      return res.status(401).json({ error: 'invalid code' });
    issueTokens(user, res);
  } catch (e) { next(e); }
});

// --- MFA enrollment (authenticated) ---
r.get('/mfa/status', requireAuth, async (req, res, next) => {
  try {
    const row = await withTenant(req.ctx, (db) =>
      db.query(`SELECT mfa_enabled FROM users WHERE id = $1`, [req.ctx.userId]).then(x => x.rows[0]));
    res.json({ mfaEnabled: !!row?.mfa_enabled });
  } catch (e) { next(e); }
});

r.post('/mfa/setup', requireAuth, async (req, res, next) => {
  try {
    const secret = generateSecret();
    await withTenant(req.ctx, (db) =>
      db.query(`UPDATE users SET mfa_secret = $1, mfa_enabled = false WHERE id = $2`, [secret, req.ctx.userId]));
    const email = (await withTenant(req.ctx, (db) =>
      db.query(`SELECT email FROM users WHERE id = $1`, [req.ctx.userId]).then(x => x.rows[0]))).email;
    // PRODUCTION: encrypt mfa_secret at rest (KMS envelope encryption)
    res.json({ secret, otpauth: otpauthUri({ secret, email }) });
  } catch (e) { next(e); }
});

r.post('/mfa/enable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const row = await withTenant(req.ctx, (db) =>
      db.query(`SELECT mfa_secret FROM users WHERE id = $1`, [req.ctx.userId]).then(x => x.rows[0]));
    if (!row?.mfa_secret || !verifyTotp(row.mfa_secret, code))
      return res.status(400).json({ error: 'invalid code — check your authenticator app' });
    await withTenant(req.ctx, (db) =>
      db.query(`UPDATE users SET mfa_enabled = true WHERE id = $1`, [req.ctx.userId]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/refresh', async (req, res) => {
  try {
    const claims = jwt.verify(req.body?.refreshToken || '', SECRET);
    if (claims.typ !== 'refresh') throw new Error('not a refresh token');
    res.json({ accessToken: jwt.sign(
      { sub: claims.sub, tenantId: claims.tenantId, role: claims.role || 'owner' },
      SECRET, { expiresIn: '15m' }) });
  } catch {
    res.status(401).json({ error: 'invalid refresh token' });
  }
});

export default r;
