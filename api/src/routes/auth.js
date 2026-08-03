import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { signAccess, signRefresh } from '../middleware/auth.js';

const r = Router();
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// Login is the one path that cannot run under RLS (no tenant context yet),
// so it uses a SECURITY-DEFINER-style lookup via the pool's app_user with
// an explicit function — for the scaffold we query with a superuser-free
// trick: set an all-tenants bypass is NOT allowed, so we look up via a
// dedicated unauthenticated query using the tenant subdomain.
r.post('/login', async (req, res, next) => {
  try {
    const { email, password, subdomain = 'demo' } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const client = await pool.connect();
    try {
      // resolve tenant first (tenants policy allows only own row; use a
      // one-off context to authorize the lookup by subdomain)
      const t = await client.query(
        `SELECT id FROM tenants WHERE subdomain = $1 AND status = 'active'
         AND set_config('app.tenant_id', id::text, true) IS NOT NULL`, [subdomain]);
      if (!t.rowCount) return res.status(401).json({ error: 'invalid credentials' });
      const tenantId = t.rows[0].id;

      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_role', 'owner', true)`, [tenantId]);
      const u = await client.query(
        `SELECT u.*, c.id AS clinician_id,
                (SELECT role FROM user_roles ur WHERE ur.user_id = u.id
                 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
                          WHEN 'biller' THEN 2 WHEN 'clinician' THEN 3 ELSE 4 END LIMIT 1) AS role
         FROM users u LEFT JOIN clinicians c ON c.user_id = u.id
         WHERE u.email = $1 AND u.status = 'active'`, [email]);
      if (!u.rowCount) return res.status(401).json({ error: 'invalid credentials' });

      const user = u.rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'invalid credentials' });

      // TODO production: verify TOTP here when user.mfa_secret is set
      await client.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
      res.json({
        accessToken: signAccess(user),
        refreshToken: signRefresh(user),
        user: { id: user.id, name: user.full_name, role: user.role, email: user.email }
      });
    } finally {
      client.release();
    }
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
