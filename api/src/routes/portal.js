import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool, withTenant } from '../db.js';
import { requirePortal } from '../middleware/auth.js';

const r = Router();
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// Patient login: email + DOB (scaffold; production: OTP)
r.post('/login', async (req, res, next) => {
  try {
    const { email, dob, subdomain = 'demo' } = req.body || {};
    if (!email || !dob) return res.status(400).json({ error: 'email and date of birth required' });
    const { rows } = await pool.query(
      'SELECT * FROM portal_login_lookup($1, $2, $3)', [subdomain, email, dob]);
    if (!rows[0]) return res.status(401).json({ error: 'no matching patient record' });
    const c = rows[0];
    res.json({
      token: jwt.sign({ typ: 'portal', clientId: c.client_id, tenantId: c.tenant_id }, SECRET, { expiresIn: '30m' }),
      name: c.name
    });
  } catch (e) { next(e); }
});

r.use(requirePortal);

r.get('/me', async (req, res, next) => {
  try {
    const me = await withTenant(req.ctx, (db) =>
      db.query(`SELECT first_name, last_name, dob, email, phone, sms_consent FROM clients WHERE id = $1`,
        [req.ctx.clientId]).then(x => x.rows[0]));
    res.json(me);
  } catch (e) { next(e); }
});

r.get('/appointments', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT a.id, a.starts_at, a.ends_at, a.appt_type, a.location, a.status, u.full_name AS clinician_name
         FROM appointments a JOIN clinicians cl ON cl.id = a.clinician_id JOIN users u ON u.id = cl.user_id
         WHERE a.client_id = $1 ORDER BY a.starts_at DESC LIMIT 50`, [req.ctx.clientId]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/prescriptions', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT p.id, p.created_at, p.medications, p.diagnoses, p.advice, p.follow_up_date, u.full_name AS clinician_name
         FROM prescriptions p JOIN clinicians cl ON cl.id = p.clinician_id JOIN users u ON u.id = cl.user_id
         WHERE p.client_id = $1 ORDER BY p.created_at DESC LIMIT 50`, [req.ctx.clientId]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Signed treatment plans (RLS hides drafts) + acknowledgement
r.get('/treatment-plans', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, async (db) => {
      const plans = await db.query(
        `SELECT tp.id, tp.title, tp.presenting_problem, tp.frequency, tp.modality,
                tp.start_date, tp.review_date, tp.signed_at, tp.client_ack_at, u.full_name AS clinician_name
         FROM treatment_plans tp
         JOIN clinicians cl ON cl.id = tp.clinician_id JOIN users u ON u.id = cl.user_id
         WHERE tp.client_id = $1 ORDER BY tp.created_at DESC`, [req.ctx.clientId]);
      for (const p of plans.rows) {
        const g = await db.query(
          `SELECT goal, objectives, status, progress_pct FROM treatment_goals WHERE plan_id = $1 ORDER BY seq`, [p.id]);
        p.goals = g.rows;
      }
      return plans.rows;
    });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/treatment-plans/:id/acknowledge', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'type your full name to sign' });
    const ok = await withTenant(req.ctx, (db) =>
      db.query(
        `UPDATE treatment_plans SET client_ack_at = now(), client_ack_name = $1
          WHERE id = $2 AND client_id = $3 AND client_ack_at IS NULL RETURNING id`,
        [name.trim(), req.params.id, req.ctx.clientId]).then(x => x.rowCount));
    if (!ok) return res.status(409).json({ error: 'already acknowledged' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.get('/invoices', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT id, amount, balance, status, created_at FROM invoices
         WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.ctx.clientId]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/clinicians', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT cl.id, u.full_name FROM clinicians cl JOIN users u ON u.id = cl.user_id
         ORDER BY u.full_name`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Self-service booking (50-minute slot)
r.post('/book', async (req, res, next) => {
  try {
    const { clinicianId, startsAt } = req.body || {};
    if (!clinicianId || !startsAt) return res.status(400).json({ error: 'clinicianId and startsAt required' });
    if (new Date(startsAt) < new Date()) return res.status(400).json({ error: 'pick a future time' });
    const endsAt = new Date(new Date(startsAt).getTime() + 50 * 60000).toISOString();

    const created = await withTenant(req.ctx, async (db) => {
      const clash = await db.query(
        `SELECT 1 FROM appointments WHERE clinician_id = $1 AND status NOT IN ('cancelled','no_show')
         AND tstzrange(starts_at, ends_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
        [clinicianId, startsAt, endsAt]);
      if (clash.rowCount) { const e = new Error('that time is no longer available'); e.status = 409; e.expose = true; throw e; }
      const { rows } = await db.query(
        `INSERT INTO appointments (tenant_id, client_id, clinician_id, starts_at, ends_at, appt_type)
         VALUES (current_tenant(), $1, $2, $3, $4, 'session') RETURNING *`,
        [req.ctx.clientId, clinicianId, startsAt, endsAt]);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default r;
