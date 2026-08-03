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

      // schedule SMS reminder 24h before (TCPA: only with consent + phone)
      const cli = await db.query(`SELECT first_name, phone, sms_consent FROM clients WHERE id = $1`, [clientId]);
      const c = cli.rows[0];
      const sendAt = new Date(new Date(startsAt).getTime() - 24 * 3600 * 1000);
      if (sendAt > new Date()) {
        const when = new Date(startsAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        await db.query(
          `INSERT INTO reminders (tenant_id, appointment_id, client_id, message, send_at, status)
           VALUES (current_tenant(), $1, $2, $3, $4, $5)`,
          [rows[0].id, clientId,
           `Hi ${c?.first_name || ''}, reminder: you have an appointment on ${when}. Reply STOP to opt out.`,
           sendAt.toISOString(),
           (c?.phone && c?.sms_consent) ? 'scheduled' : 'skipped_no_consent']);
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
      const { rows } = await db.query(
        `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`, [status, req.params.id]);
      if (!rows[0]) return null;
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
