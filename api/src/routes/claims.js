import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// Claim status machine (doc §2.1)
const TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['in_revision', 'pending_patient_liability', 'funded', 'denied'],
  in_revision: ['submitted'],
  pending_patient_liability: ['funded'],
  denied: ['in_revision'],
  funded: []
};

// Claim tracker — the fields from the spec: client, payout date, rate,
// claim number, provider, DOS, status
r.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const rows = await withTenant(req.ctx, async (db) => {
      const params = [];
      let where = 'TRUE';
      if (status) { params.push(status); where = `cl.status = $1`; }
      const { rows } = await db.query(
        `SELECT cl.id, cl.claim_number, cl.dos, cl.rate, cl.status,
                cl.expected_payout_date, cl.funded_at,
                c.first_name || ' ' || c.last_name AS client_name,
                u.full_name AS provider_name
         FROM claims cl
         JOIN clients c ON c.id = cl.client_id
         JOIN clinicians p ON p.id = cl.provider_id
         JOIN users u ON u.id = p.user_id
         WHERE ${where}
         ORDER BY cl.dos DESC LIMIT 500`, params);
      return rows;
    });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/:id/history', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(`SELECT from_status, to_status, source, at FROM claim_status_history
                WHERE claim_id = $1 ORDER BY at`, [req.params.id]).then(r => r.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Submit / transition — billers and owners only
r.patch('/:id/status', requireRole('owner', 'biller'), async (req, res, next) => {
  try {
    const { status: to, expectedPayoutDate, claimNumber } = req.body || {};
    const updated = await withTenant(req.ctx, async (db) => {
      const cur = await db.query(`SELECT status FROM claims WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!cur.rowCount) return { code: 404 };
      const from = cur.rows[0].status;
      if (!TRANSITIONS[from]?.includes(to))
        return { code: 422, msg: `invalid transition ${from} → ${to}` };

      const { rows } = await db.query(
        `UPDATE claims SET status = $1,
                expected_payout_date = COALESCE($2, expected_payout_date),
                claim_number = COALESCE($3, claim_number),
                funded_at = CASE WHEN $1 = 'funded' THEN now() ELSE funded_at END
         WHERE id = $4 RETURNING *`,
        [to, expectedPayoutDate || null, claimNumber || null, req.params.id]);
      await db.query(
        `INSERT INTO claim_status_history (tenant_id, claim_id, from_status, to_status, source)
         VALUES (current_tenant(), $1, $2, $3, 'manual')`, [req.params.id, from, to]);
      await audit(db, req.ctx, `CLAIM:${from}->${to}`, 'claims', req.params.id);
      return { code: 200, claim: rows[0] };
    });
    if (updated.code !== 200) return res.status(updated.code).json({ error: updated.msg || 'not found' });
    res.json(updated.claim);
  } catch (e) { next(e); }
});

// Aging summary for reporting
r.get('/reports/aging', requireRole('owner', 'biller'), async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(`SELECT status, count(*)::int AS count, coalesce(sum(rate),0)::numeric(12,2) AS total,
                       avg(now()::date - dos)::int AS avg_age_days
                FROM claims WHERE status NOT IN ('funded') GROUP BY status`).then(r => r.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

export default r;
