import { Router } from 'express';
import { withTenant, audit } from '../db.js';

const r = Router();
const VALID = ['booked', 'confirmed', 'arrived', 'completed', 'no_show', 'cancelled'];

r.get('/', async (req, res, next) => {
  try {
    const { from, to, clinicianId } = req.query;
    const rows = await withTenant(req.ctx, async (db) => {
      const params = [from || new Date().toISOString(), to || new Date(Date.now() + 7 * 864e5).toISOString()];
      let where = 'a.starts_at >= $1 AND a.starts_at < $2';
      if (clinicianId) { params.push(clinicianId); where += ` AND a.clinician_id = $${params.length}`; }
      const { rows } = await db.query(
        `SELECT a.*, c.first_name, c.last_name
         FROM appointments a JOIN clients c ON c.id = a.client_id
         WHERE ${where} ORDER BY a.starts_at LIMIT 500`, params);
      return rows;
    });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const { clientId, clinicianId, startsAt, endsAt, apptType, location } = req.body || {};
    if (!clientId || !clinicianId || !startsAt || !endsAt)
      return res.status(400).json({ error: 'clientId, clinicianId, startsAt, endsAt required' });
    const created = await withTenant(req.ctx, async (db) => {
      // conflict check
      const clash = await db.query(
        `SELECT 1 FROM appointments WHERE clinician_id = $1 AND status NOT IN ('cancelled','no_show')
         AND tstzrange(starts_at, ends_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
        [clinicianId, startsAt, endsAt]);
      if (clash.rowCount) { const e = new Error('time slot conflicts with an existing appointment'); e.status = 409; e.expose = true; throw e; }
      const { rows } = await db.query(
        `INSERT INTO appointments (tenant_id, client_id, clinician_id, starts_at, ends_at, appt_type, location)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [clientId, clinicianId, startsAt, endsAt, apptType || 'session', location || 'office']);

      // schedule reminders 24h before — SMS (TCPA: consent + phone) and email
      const cli = await db.query(
        `SELECT first_name, phone, email, sms_consent FROM clients WHERE id = $1`, [clientId]);
      const c = cli.rows[0];
      const sendAt = new Date(new Date(startsAt).getTime() - 24 * 3600 * 1000);
      if (sendAt > new Date()) {
        const when = new Date(startsAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const body = `Hi ${c?.first_name || ''}, reminder: you have an appointment on ${when}.`;
        await db.query(
          `INSERT INTO reminders (tenant_id, appointment_id, client_id, channel, message, send_at, status)
           VALUES (current_tenant(), $1, $2, 'sms', $3, $4, $5)`,
          [rows[0].id, clientId, `${body} Reply STOP to opt out.`, sendAt.toISOString(),
           (c?.phone && c?.sms_consent) ? 'scheduled' : 'skipped_no_consent']);
        await db.query(
          `INSERT INTO reminders (tenant_id, appointment_id, client_id, channel, message, send_at, status)
           VALUES (current_tenant(), $1, $2, 'email', $3, $4, $5)`,
          [rows[0].id, clientId, body, sendAt.toISOString(),
           c?.email ? 'scheduled' : 'skipped_no_consent']);
      }
      await audit(db, req.ctx, 'CREATE', 'appointments', rows[0].id);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Status transitions; completing an appointment auto-opens an encounter
r.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` });
    const result = await withTenant(req.ctx, async (db) => {
      // late-cancel / no-show fee per practice policy
      let fee = null;
      if (['cancelled', 'no_show'].includes(status)) {
        const cfg = await db.query(
          `SELECT late_cancel_hours, late_cancel_fee FROM branding WHERE tenant_id = current_tenant()`);
        const appt = await db.query(`SELECT starts_at FROM appointments WHERE id = $1`, [req.params.id]);
        const hoursOut = appt.rowCount
          ? (new Date(appt.rows[0].starts_at) - Date.now()) / 3600000 : 999;
        const policy = cfg.rows[0];
        if (policy && +policy.late_cancel_fee > 0 &&
            (status === 'no_show' || hoursOut < policy.late_cancel_hours)) {
          fee = +policy.late_cancel_fee;
        }
      }

      const { rows } = await db.query(
        `UPDATE appointments
            SET status = $1,
                cancelled_at = CASE WHEN $1 IN ('cancelled','no_show') THEN now() ELSE cancelled_at END,
                late_cancel_fee = COALESCE($3, late_cancel_fee)
          WHERE id = $2 RETURNING *`, [status, req.params.id, fee]);
      if (!rows[0]) return null;

      // bill the fee as a self-pay invoice
      if (fee) {
        await db.query(
          `INSERT INTO invoices (tenant_id, client_id, amount, balance, status)
           VALUES (current_tenant(), $1, $2, $2, 'open')`, [rows[0].client_id, fee]);
      }

      // freed slot? surface matching waitlist candidates to the front desk
      if (status === 'cancelled') {
        await db.query(
          `INSERT INTO notifications (tenant_id, role_scope, kind, title, body, link)
           VALUES (current_tenant(), 'front_desk', 'appointment', 'Slot freed up',
                   'A cancellation opened a slot — check the waitlist for a match.', '/scheduling')`);
      }
      if (status === 'completed') {
        await db.query(
          `INSERT INTO encounters (tenant_id, appointment_id, client_id, clinician_id, dos, status)
           VALUES (current_tenant(), $1, $2, $3, ($4::timestamptz)::date, 'note_pending')
           ON CONFLICT (appointment_id) DO NOTHING`,
          [rows[0].id, rows[0].client_id, rows[0].clinician_id, rows[0].starts_at]);
      }
      await audit(db, req.ctx, `STATUS:${status}`, 'appointments', req.params.id);
      return rows[0];
    });
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json(result);
  } catch (e) { next(e); }
});

export default r;
