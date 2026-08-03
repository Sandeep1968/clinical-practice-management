import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, withTenant } from '../db.js';
import { signAccess, signRefresh, requireAuth } from '../middleware/auth.js';
import { generateSecret, verifyTotp, otpauthUri } from '../lib/totp.js';

const r = Router();
const SECRET = process.env.JWT_SECRET || 'dev-secret';

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
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

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
