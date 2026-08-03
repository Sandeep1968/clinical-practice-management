import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// ---------- availability rules ----------
r.get('/availability/:clinicianId', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const rules = await db.query(
        `SELECT * FROM availability_rules WHERE clinician_id = $1 ORDER BY weekday, start_time`,
        [req.params.clinicianId]);
      const blocks = await db.query(
        `SELECT * FROM availability_blocks WHERE clinician_id = $1 AND ends_at > now() ORDER BY starts_at`,
        [req.params.clinicianId]);
      return { rules: rules.rows, blocks: blocks.rows };
    });
    res.json(data);
  } catch (e) { next(e); }
});

r.put('/availability/:clinicianId', async (req, res, next) => {
  try {
    const { rules = [] } = req.body || {};
    await withTenant(req.ctx, async (db) => {
      await db.query(`DELETE FROM availability_rules WHERE clinician_id = $1`, [req.params.clinicianId]);
      for (const rule of rules) {
        if (!rule.startTime || !rule.endTime) continue;
        await db.query(
          `INSERT INTO availability_rules (tenant_id, clinician_id, weekday, start_time, end_time, slot_minutes, accepts_new)
           VALUES (current_tenant(), $1, $2, $3, $4, $5, $6)`,
          [req.params.clinicianId, rule.weekday, rule.startTime, rule.endTime,
           rule.slotMinutes || 50, rule.acceptsNew !== false]);
      }
      await audit(db, req.ctx, 'AVAILABILITY_UPDATE', 'availability_rules', req.params.clinicianId);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/blocks', async (req, res, next) => {
  try {
    const { clinicianId, startsAt, endsAt, reason } = req.body || {};
    if (!clinicianId || !startsAt || !endsAt)
      return res.status(400).json({ error: 'clinicianId, startsAt and endsAt required' });
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `INSERT INTO availability_blocks (tenant_id, clinician_id, starts_at, ends_at, reason)
         VALUES (current_tenant(), $1, $2, $3, $4) RETURNING *`,
        [clinicianId, startsAt, endsAt, reason || null]).then(x => x.rows[0]));
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// ---------- open slots (shared by staff booking and the portal) ----------
// Generates slots from availability rules minus booked appointments and blocks.
export async function computeSlots(db, { clinicianId, fromDate, days = 21, leadHours = 12 }) {
  const rules = await db.query(
    `SELECT * FROM availability_rules WHERE clinician_id = $1 AND accepts_new`, [clinicianId]);
  if (!rules.rowCount) return [];
  const start = fromDate ? new Date(fromDate) : new Date();
  const end = new Date(start.getTime() + days * 864e5);

  const booked = await db.query(
    `SELECT starts_at, ends_at FROM appointments
      WHERE clinician_id = $1 AND status NOT IN ('cancelled','no_show')
        AND starts_at BETWEEN $2 AND $3`, [clinicianId, start.toISOString(), end.toISOString()]);
  const blocks = await db.query(
    `SELECT starts_at, ends_at FROM availability_blocks
      WHERE clinician_id = $1 AND ends_at > $2 AND starts_at < $3`,
    [clinicianId, start.toISOString(), end.toISOString()]);

  const busy = [...booked.rows, ...blocks.rows].map(b => [new Date(b.starts_at), new Date(b.ends_at)]);
  const earliest = new Date(Date.now() + leadHours * 3600 * 1000);
  const slots = [];

  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 864e5);
    const wd = day.getDay();
    for (const rule of rules.rows.filter(x => x.weekday === wd)) {
      const [sh, sm] = rule.start_time.split(':').map(Number);
      const [eh, em] = rule.end_time.split(':').map(Number);
      const dayStart = new Date(day); dayStart.setHours(sh, sm, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(eh, em, 0, 0);
      for (let t = new Date(dayStart); t < dayEnd; t = new Date(t.getTime() + rule.slot_minutes * 60000)) {
        const slotEnd = new Date(t.getTime() + rule.slot_minutes * 60000);
        if (slotEnd > dayEnd || t < earliest) continue;
        const clash = busy.some(([bs, be]) => t < be && slotEnd > bs);
        if (!clash) slots.push({ startsAt: t.toISOString(), endsAt: slotEnd.toISOString() });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

r.get('/slots/:clinicianId', async (req, res, next) => {
  try {
    const slots = await withTenant(req.ctx, (db) =>
      computeSlots(db, { clinicianId: req.params.clinicianId, fromDate: req.query.from, days: +(req.query.days || 21) }));
    res.json({ data: slots });
  } catch (e) { next(e); }
});

// ---------- recurring series ----------
r.post('/series', async (req, res, next) => {
  try {
    const { clientId, clinicianId, cadence = 'weekly', weekday, startTime,
            durationMinutes = 50, startsOn, occurrences = 12 } = req.body || {};
    if (!clientId || !clinicianId || weekday === undefined || !startTime || !startsOn)
      return res.status(400).json({ error: 'clientId, clinicianId, weekday, startTime and startsOn required' });

    const result = await withTenant(req.ctx, async (db) => {
      const step = cadence === 'biweekly' ? 14 : 7;
      const n = Math.min(+occurrences, 52);
      const { rows } = await db.query(
        `INSERT INTO appointment_series
           (tenant_id, client_id, clinician_id, cadence, weekday, start_time, duration_minutes, starts_on, ends_on)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [clientId, clinicianId, cadence, weekday, startTime, durationMinutes, startsOn,
         new Date(new Date(startsOn).getTime() + n * step * 864e5).toISOString().slice(0, 10)]);
      const series = rows[0];

      // roll forward to the first matching weekday
      const first = new Date(`${startsOn}T${startTime}`);
      while (first.getDay() !== +weekday) first.setDate(first.getDate() + 1);

      let created = 0, skipped = 0;
      for (let i = 0; i < n; i++) {
        const s = new Date(first.getTime() + i * step * 864e5);
        const e = new Date(s.getTime() + durationMinutes * 60000);
        const clash = await db.query(
          `SELECT 1 FROM appointments WHERE clinician_id = $1 AND status NOT IN ('cancelled','no_show')
            AND tstzrange(starts_at, ends_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
          [clinicianId, s.toISOString(), e.toISOString()]);
        if (clash.rowCount) { skipped++; continue; }   // keep the series, skip the conflict
        await db.query(
          `INSERT INTO appointments (tenant_id, client_id, clinician_id, starts_at, ends_at, series_id)
           VALUES (current_tenant(), $1, $2, $3, $4, $5)`,
          [clientId, clinicianId, s.toISOString(), e.toISOString(), series.id]);
        created++;
      }
      await audit(db, req.ctx, 'SERIES_CREATE', 'appointment_series', series.id);
      return { series, created, skipped };
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

r.get('/series', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT s.*, c.first_name || ' ' || c.last_name AS client_name,
                (SELECT count(*)::int FROM appointments a
                  WHERE a.series_id = s.id AND a.starts_at > now()
                    AND a.status NOT IN ('cancelled','no_show')) AS upcoming
         FROM appointment_series s JOIN clients c ON c.id = s.client_id
         WHERE s.active ORDER BY s.weekday, s.start_time`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// End a series (keeps past appointments, cancels future ones)
r.delete('/series/:id', async (req, res, next) => {
  try {
    const n = await withTenant(req.ctx, async (db) => {
      await db.query(`UPDATE appointment_series SET active = false WHERE id = $1`, [req.params.id]);
      const { rowCount } = await db.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = now()
          WHERE series_id = $1 AND starts_at > now() AND status NOT IN ('completed','cancelled')`,
        [req.params.id]);
      await audit(db, req.ctx, 'SERIES_END', 'appointment_series', req.params.id);
      return rowCount;
    });
    res.json({ ok: true, cancelled: n });
  } catch (e) { next(e); }
});

// ---------- waitlist ----------
r.get('/waitlist', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT w.*, c.first_name || ' ' || c.last_name AS client_name, c.phone,
                u.full_name AS clinician_name
         FROM waitlist_entries w
         JOIN clients c ON c.id = w.client_id
         LEFT JOIN clinicians cl ON cl.id = w.clinician_id
         LEFT JOIN users u ON u.id = cl.user_id
         WHERE w.status IN ('waiting','offered') ORDER BY w.created_at`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/waitlist', async (req, res, next) => {
  try {
    const { clientId, clinicianId, preferredWeekdays = [], preferredFrom, preferredTo, notes } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `INSERT INTO waitlist_entries
           (tenant_id, client_id, clinician_id, preferred_weekdays, preferred_from, preferred_to, notes)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [clientId, clinicianId || null, preferredWeekdays, preferredFrom || null,
         preferredTo || null, notes || null]).then(x => x.rows[0]));
    res.status(201).json(row);
  } catch (e) { next(e); }
});

r.patch('/waitlist/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    await withTenant(req.ctx, (db) =>
      db.query(
        `UPDATE waitlist_entries SET status = $1,
                offered_at = CASE WHEN $1 = 'offered' THEN now() ELSE offered_at END
          WHERE id = $2`, [status, req.params.id]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Candidates for a freed slot — matched on preferences
r.get('/waitlist/match', async (req, res, next) => {
  try {
    const { startsAt, clinicianId } = req.query;
    if (!startsAt) return res.status(400).json({ error: 'startsAt required' });
    const wd = new Date(startsAt).getDay();
    const time = new Date(startsAt).toTimeString().slice(0, 8);
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT w.*, c.first_name || ' ' || c.last_name AS client_name, c.phone, c.sms_consent
         FROM waitlist_entries w JOIN clients c ON c.id = w.client_id
         WHERE w.status = 'waiting'
           AND (w.clinician_id IS NULL OR $2::uuid IS NULL OR w.clinician_id = $2::uuid)
           AND (cardinality(w.preferred_weekdays) = 0 OR $1 = ANY(w.preferred_weekdays))
           AND (w.preferred_from IS NULL OR w.preferred_from <= $3::time)
           AND (w.preferred_to IS NULL OR w.preferred_to >= $3::time)
         ORDER BY w.created_at LIMIT 20`,
        [wd, clinicianId || null, time]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

export default r;
