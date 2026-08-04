// Platform (super-admin) console — spans tenants. Separate credential store,
// separate JWT type; a practice token can never reach these routes.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { verifyPassword } from '../lib/password.js';
import { authLimiter } from '../middleware/security.js';
import { config } from '../config.js';

const r = Router();
const SECRET = config.jwtSecret;

function requirePlatform(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const claims = jwt.verify(token, SECRET);
    if (claims.typ !== 'platform') throw new Error('wrong token type');
    req.admin = { id: claims.sub, name: claims.name };
    next();
  } catch {
    res.status(401).json({ error: 'unauthenticated' });
  }
}

r.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM platform_login_lookup($1)', [email || '']);
    const admin = rows[0];
    const { ok } = admin
      ? await verifyPassword(password || '', admin.password_hash)
      : { ok: false };
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    res.json({
      token: jwt.sign({ typ: 'platform', sub: admin.id, name: admin.full_name }, SECRET, { expiresIn: '2h' }),
      name: admin.full_name
    });
  } catch (e) { next(e); }
});

r.use(requirePlatform);

r.get('/metrics', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM platform_metrics()');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

r.get('/practices', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM platform_practices()');
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/plans', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.code, p.name, p.price_per_seat, p.max_clinicians, p.features,
              (SELECT count(*)::int FROM subscriptions s
                WHERE s.plan_id = p.id AND s.cancelled_at IS NULL) AS practices
       FROM plans p WHERE p.active ORDER BY p.price_per_seat`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.patch('/practices/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['active', 'suspended'].includes(status))
      return res.status(400).json({ error: "status must be 'active' or 'suspended'" });
    await pool.query('SELECT platform_set_practice_status($1,$2)', [req.params.id, status]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.patch('/practices/:id/plan', async (req, res, next) => {
  try {
    const { plan, seats = 1 } = req.body || {};
    await pool.query('SELECT platform_change_plan($1,$2,$3)', [req.params.id, plan, seats]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
