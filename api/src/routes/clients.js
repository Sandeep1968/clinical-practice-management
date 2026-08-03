import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// List clients — RLS automatically scopes clinicians to their caseload.
// Keyset pagination for scale (no OFFSET table scans).
r.get('/', async (req, res, next) => {
  try {
    const { after, q, limit = 50 } = req.query;
    const rows = await withTenant(req.ctx, async (db) => {
      const params = [Math.min(+limit, 200)];
      let where = 'TRUE';
      if (q) { params.push(`%${q}%`); where += ` AND (last_name ILIKE $${params.length} OR first_name ILIKE $${params.length})`; }
      if (after) { params.push(after); where += ` AND id > $${params.length}`; }
      const { rows } = await db.query(
        `SELECT id, first_name, last_name, dob, email, phone, status
         FROM clients WHERE ${where} ORDER BY id LIMIT $1`, params);
      return rows;
    });
    res.json({ data: rows, nextCursor: rows.length ? rows[rows.length - 1].id : null });
  } catch (e) { next(e); }
});

r.post('/', requireRole('owner', 'admin', 'front_desk'), async (req, res, next) => {
  try {
    const { firstName, lastName, dob, email, phone, smsConsent, clinicianId } = req.body || {};
    if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName required' });
    const created = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO clients (tenant_id, first_name, last_name, dob, email, phone, sms_consent)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [firstName, lastName, dob || null, email || null, phone || null, !!smsConsent]);
      if (clinicianId) {
        await db.query(`INSERT INTO client_assignments (client_id, clinician_id) VALUES ($1, $2)`,
          [rows[0].id, clinicianId]);
      }
      await audit(db, req.ctx, 'CREATE', 'clients', rows[0].id);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const client = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(`SELECT * FROM clients WHERE id = $1`, [req.params.id]);
      if (rows[0]) await audit(db, req.ctx, 'READ', 'clients', rows[0].id);
      return rows[0];
    });
    if (!client) return res.status(404).json({ error: 'not found' });  // also returned when RLS hides it
    res.json(client);
  } catch (e) { next(e); }
});

// Assign / reassign clinician
r.post('/:id/assign', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    await withTenant(req.ctx, async (db) => {
      await db.query(
        `INSERT INTO client_assignments (client_id, clinician_id) VALUES ($1, $2)
         ON CONFLICT (client_id, clinician_id) DO UPDATE SET ended_at = NULL`,
        [req.params.id, req.body.clinicianId]);
      await audit(db, req.ctx, 'ASSIGN', 'client_assignments', req.params.id);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
