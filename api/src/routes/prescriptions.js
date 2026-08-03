import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// Create prescription (clinician only; RLS scopes to own caseload)
r.post('/', requireRole('clinician'), async (req, res, next) => {
  try {
    const { clientId, encounterId, diagnoses = [], medications = [], advice, followUpDate } = req.body || {};
    if (!clientId || !medications.length)
      return res.status(400).json({ error: 'clientId and at least one medication required' });
    const created = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO prescriptions
           (tenant_id, client_id, clinician_id, encounter_id, diagnoses, medications, advice, follow_up_date)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [clientId, req.ctx.clinicianId, encounterId || null,
         JSON.stringify(diagnoses), JSON.stringify(medications), advice || null, followUpDate || null]);
      await audit(db, req.ctx, 'RX_CREATE', 'prescriptions', rows[0].id);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// List prescriptions for a client
r.get('/client/:id', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT p.*, u.full_name AS clinician_name
         FROM prescriptions p
         JOIN clinicians cl ON cl.id = p.clinician_id
         JOIN users u ON u.id = cl.user_id
         WHERE p.client_id = $1 ORDER BY p.created_at DESC LIMIT 50`,
        [req.params.id]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Full prescription for printing (includes practice + client details)
r.get('/:id/print', async (req, res, next) => {
  try {
    const rx = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT p.*, u.full_name AS clinician_name, cl.npi, cl.license_no,
                c.first_name || ' ' || c.last_name AS client_name, c.dob,
                t.name AS practice_name
         FROM prescriptions p
         JOIN clinicians cl ON cl.id = p.clinician_id
         JOIN users u ON u.id = cl.user_id
         JOIN clients c ON c.id = p.client_id
         JOIN tenants t ON t.id = p.tenant_id
         WHERE p.id = $1`, [req.params.id]).then(x => x.rows[0]));
    if (!rx) return res.status(404).json({ error: 'not found' });
    res.json(rx);
  } catch (e) { next(e); }
});

export default r;
