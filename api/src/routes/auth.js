import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { signAccess, signRefresh } from '../middleware/auth.js';

const r = Router();
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// Login runs before any tenant context exists, so it uses the SECURITY DEFINER
// function auth_login_lookup() (see 001_schema.sql) instead of fighting RLS.
r.post('/login', async (req, res, next) => {
  try {
    const { email, password, subdomain = 'demo' } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const { rows } = await pool.query(
      'SELECT * FROM auth_login_lookup($1, $2)', [subdomain, email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    // TODO production: verify TOTP here when user.mfa_secret is set

    // update last_login under proper tenant context (RLS applies)
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, false),
                                 set_config('app.user_role', $2, false)`,
        [user.tenant_id, user.role]);
      await client.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
    } finally {
      client.release();
    }

    res.json({
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
      user: { id: user.id, name: user.full_name, role: user.role, email: user.email }
    });
  } catch (e) { next(e); }
});

r.post('/refresh', async (req, res) => {
  try {
    const claims = jwt.verify(req.body?.refreshToken || '', SECRET);
    if (claims.typ !== 'refresh') throw new Error('not a refresh token');
    // TODO production: rotate + persist refresh token family, revoke on reuse
    res.json({ accessToken: jwt.sign(
      { sub: claims.sub, tenantId: claims.tenantId, role: claims.role || 'owner' },
      SECRET, { expiresIn: '15m' }) });
  } catch {
    res.status(401).json({ error: 'invalid refresh token' });
  }
});

export default r;
