import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool, withTenant } from '../db.js';
import { requirePortal } from '../middleware/auth.js';
import { computeSlots } from './scheduling.js';

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

// ---------- documents & e-signature ----------
r.get('/documents', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT id, kind, title, body, status, requires_signature, signed_by_client_at, created_at
         FROM documents WHERE client_id = $1 ORDER BY created_at DESC`,
        [req.ctx.clientId]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/documents/:id/sign', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'type your full name to sign' });
    const ok = await withTenant(req.ctx, (db) =>
      db.query(
        `UPDATE documents SET signed_by_client_at = now(), signed_by_client_name = $1, status = 'signed'
          WHERE id = $2 AND client_id = $3 AND signed_by_client_at IS NULL RETURNING id`,
        [name.trim(), req.params.id, req.ctx.clientId]).then(x => x.rowCount));
    if (!ok) return res.status(409).json({ error: 'already signed' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- secure messaging ----------
r.get('/messages', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const threads = await db.query(
        `SELECT id, subject, last_message_at FROM message_threads
         WHERE client_id = $1 ORDER BY last_message_at DESC`, [req.ctx.clientId]);
      for (const t of threads.rows) {
        const m = await db.query(
          `SELECT sender_kind, body, created_at FROM messages WHERE thread_id = $1 ORDER BY created_at`, [t.id]);
        t.messages = m.rows;
      }
      await db.query(
        `UPDATE messages SET read_by_client_at = now()
          WHERE sender_kind = 'staff' AND read_by_client_at IS NULL
            AND thread_id IN (SELECT id FROM message_threads WHERE client_id = $1)`, [req.ctx.clientId]);
      return threads.rows;
    });
    res.json({ data });
  } catch (e) { next(e); }
});

r.post('/messages', async (req, res, next) => {
  try {
    const { threadId, subject, body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'message required' });
    await withTenant(req.ctx, async (db) => {
      let tid = threadId;
      if (!tid) {
        const t = await db.query(
          `INSERT INTO message_threads (tenant_id, client_id, subject)
           VALUES (current_tenant(), $1, $2) RETURNING id`,
          [req.ctx.clientId, subject || 'Message from patient']);
        tid = t.rows[0].id;
      }
      await db.query(
        `INSERT INTO messages (tenant_id, thread_id, sender_kind, body)
         VALUES (current_tenant(), $1, 'client', $2)`, [tid, body]);
      await db.query(`UPDATE message_threads SET last_message_at = now() WHERE id = $1`, [tid]);
      await db.query(
        `INSERT INTO notifications (tenant_id, role_scope, kind, title, body, link)
         VALUES (current_tenant(), 'clinician', 'message', 'New patient message', $1, '/messages')`,
        [body.slice(0, 120)]);
    });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- payment plans (patient view) ----------
r.get('/payment-plans', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const plans = await db.query(
        `SELECT id, total_amount, installments, cadence, status FROM payment_plans
         WHERE client_id = $1 AND status = 'active'`, [req.ctx.clientId]);
      for (const p of plans.rows) {
        const items = await db.query(
          `SELECT id, seq, due_date, amount, paid_at, status FROM payment_plan_items
           WHERE plan_id = $1 ORDER BY seq`, [p.id]);
        p.items = items.rows;
      }
      return plans.rows;
    });
    res.json({ data });
  } catch (e) { next(e); }
});

r.get('/branding', async (req, res, next) => {
  try {
    const row = await withTenant(req.ctx, (db) =>
      db.query(`SELECT display_name, logo_url, primary_color, portal_welcome FROM branding
                 WHERE tenant_id = current_tenant()`).then(x => x.rows[0]));
    res.json(row || {});
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

// Open slots from the clinician's availability rules
r.get('/slots/:clinicianId', async (req, res, next) => {
  try {
    const slots = await withTenant(req.ctx, async (db) => {
      const cfg = await db.query(
        `SELECT booking_lead_hours, booking_horizon_days FROM branding WHERE tenant_id = current_tenant()`);
      return computeSlots(db, {
        clinicianId: req.params.clinicianId,
        days: Math.min(cfg.rows[0]?.booking_horizon_days || 60, 60),
        leadHours: cfg.rows[0]?.booking_lead_hours ?? 12
      });
    });
    res.json({ data: slots });
  } catch (e) { next(e); }
});

// Self-service booking — must land on a real open slot
r.post('/book', async (req, res, next) => {
  try {
    const { clinicianId, startsAt, location = 'office', clientState } = req.body || {};
    if (!clinicianId || !startsAt) return res.status(400).json({ error: 'clinicianId and startsAt required' });
    if (new Date(startsAt) < new Date()) return res.status(400).json({ error: 'pick a future time' });

    const created = await withTenant(req.ctx, async (db) => {
      // telehealth licensure: clinician must be licensed where the client is located
      if (location === 'telehealth') {
        const st = clientState || (await db.query(
          `SELECT state FROM clients WHERE id = $1`, [req.ctx.clientId])).rows[0]?.state;
        const lic = await db.query(`SELECT licensed_states FROM clinicians WHERE id = $1`, [clinicianId]);
        const states = lic.rows[0]?.licensed_states || [];
        if (st && states.length && !states.includes(st)) {
          const e = new Error(`this provider is not licensed to deliver telehealth in ${st}`);
          e.status = 422; e.expose = true; throw e;
        }
      }

      const cfg = await db.query(
        `SELECT booking_lead_hours, booking_horizon_days FROM branding WHERE tenant_id = current_tenant()`);
      const slots = await computeSlots(db, {
        clinicianId,
        days: Math.min(cfg.rows[0]?.booking_horizon_days || 60, 60),
        leadHours: cfg.rows[0]?.booking_lead_hours ?? 12
      });
      const slot = slots.find(s => s.startsAt === new Date(startsAt).toISOString());
      if (!slot) { const e = new Error('that time is no longer available'); e.status = 409; e.expose = true; throw e; }

      const { rows } = await db.query(
        `INSERT INTO appointments (tenant_id, client_id, clinician_id, starts_at, ends_at, appt_type, location, client_state)
         VALUES (current_tenant(), $1, $2, $3, $4, 'session', $5, $6) RETURNING *`,
        [req.ctx.clientId, clinicianId, slot.startsAt, slot.endsAt, location, clientState || null]);
      await db.query(
        `INSERT INTO notifications (tenant_id, role_scope, kind, title, body, link)
         VALUES (current_tenant(), 'front_desk', 'appointment', 'New online booking',
                 'A patient booked through the portal.', '/queue')`);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Join the waitlist when nothing suitable is open
r.post('/waitlist', async (req, res, next) => {
  try {
    const { clinicianId, preferredWeekdays = [], notes } = req.body || {};
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `INSERT INTO waitlist_entries (tenant_id, client_id, clinician_id, preferred_weekdays, notes)
         VALUES (current_tenant(), $1, $2, $3, $4) RETURNING *`,
        [req.ctx.clientId, clinicianId || null, preferredWeekdays, notes || null]).then(x => x.rows[0]));
    res.status(201).json(row);
  } catch (e) { next(e); }
});

export default r;
