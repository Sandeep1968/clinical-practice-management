import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { checkEligibility } from '../adapters/pverify.js';

const r = Router();

// Run an eligibility check for a client's primary policy (Pverify adapter)
r.post('/check', async (req, res, next) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const result = await withTenant(req.ctx, async (db) => {
      const pol = await db.query(
        `SELECT p.*, c.first_name, c.last_name FROM client_policies p
         JOIN clients c ON c.id = p.client_id
         WHERE p.client_id = $1 ORDER BY p.rank LIMIT 1`, [clientId]);
      if (!pol.rowCount) return { error: 'no insurance policy on file for this client', code: 404 };

      const policy = pol.rows[0];
      const check = await checkEligibility({
        policy, client: { name: `${policy.first_name} ${policy.last_name}` }
      });

      const saved = await db.query(
        `INSERT INTO eligibility_checks
           (tenant_id, policy_id, pverify_ref, result, copay, deductible_remaining, status)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [policy.id, check.ref, JSON.stringify(check.raw || {}), check.copay,
         check.deductibleRemaining, check.status]);
      await audit(db, req.ctx, 'ELIGIBILITY_CHECK', 'eligibility_checks', saved.rows[0].id);
      return { check: { ...check, id: saved.rows[0].id, checkedAt: saved.rows[0].checked_at } };
    });

    if (result.error) return res.status(result.code).json({ error: result.error });
    res.json(result.check);
  } catch (e) { next(e); }
});

// Latest eligibility result for a client
r.get('/client/:id', async (req, res, next) => {
  try {
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT ec.* FROM eligibility_checks ec
         JOIN client_policies p ON p.id = ec.policy_id
         WHERE p.client_id = $1 ORDER BY ec.checked_at DESC LIMIT 1`,
        [req.params.id]).then(r => r.rows[0]));
    if (!row) return res.status(404).json({ error: 'no eligibility checks on file' });
    res.json(row);
  } catch (e) { next(e); }
});

export default r;
