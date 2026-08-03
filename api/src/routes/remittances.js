import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { fetchRemittances } from '../adapters/era.js';

const r = Router();

// Fetch + auto-post ERAs. Mock mode covers every adjudicated claim
// (submitted or pending_patient_liability). Per line:
//   1. record payer payment  2. claim → funded  3. invoice patient balance
r.post('/fetch', requireRole('owner', 'biller'), async (req, res, next) => {
  try {
    const result = await withTenant(req.ctx, async (db) => {
      const { rows: claims } = await db.query(
        `SELECT id, claim_number, rate, payer_id, client_id, status FROM claims
         WHERE status IN ('submitted', 'pending_patient_liability')
         ORDER BY dos LIMIT 100 FOR UPDATE`);
      if (!claims.length) return { posted: 0, message: 'no adjudicated claims awaiting payment' };

      const eras = await fetchRemittances({ claims });
      let posted = 0;

      for (const era of eras) {
        const remit = await db.query(
          `INSERT INTO remittances (tenant_id, payer_id, era_ref, total, posted_at, raw)
           VALUES (current_tenant(), $1, $2, $3, now(), $4) RETURNING id`,
          [era.payerId, era.eraRef, era.total, JSON.stringify(era.raw || {})]);
        const remitId = remit.rows[0].id;

        for (const line of era.lines) {
          const claim = claims.find(c => c.id === line.claimId);
          if (!claim) continue;

          await db.query(
            `INSERT INTO remittance_lines
               (tenant_id, remittance_id, claim_id, billed, paid, patient_responsibility, adjustment_codes)
             VALUES (current_tenant(), $1, $2, $3, $4, $5, $6)`,
            [remitId, line.claimId, line.billed, line.paid, line.patientResponsibility, line.adjustmentCodes]);

          // 1. payer payment
          await db.query(
            `INSERT INTO payments (tenant_id, client_id, claim_id, method, amount, processor_ref)
             VALUES (current_tenant(), $1, $2, 'era', $3, $4)`,
            [claim.client_id, line.claimId, line.paid, era.eraRef]);

          // 2. claim → funded
          await db.query(
            `UPDATE claims SET status = 'funded', funded_at = now() WHERE id = $1`, [line.claimId]);
          await db.query(
            `INSERT INTO claim_status_history (tenant_id, claim_id, from_status, to_status, source, payload)
             VALUES (current_tenant(), $1, $2, 'funded', 'era', $3)`,
            [line.claimId, claim.status, JSON.stringify({ eraRef: era.eraRef, paid: line.paid })]);

          // 3. patient responsibility → open invoice
          if (line.patientResponsibility > 0) {
            await db.query(
              `INSERT INTO invoices (tenant_id, client_id, amount, balance, status)
               VALUES (current_tenant(), $1, $2, $2, 'open')`,
              [claim.client_id, line.patientResponsibility]);
          }
          posted++;
        }
        await audit(db, req.ctx, 'ERA_POST', 'remittances', remitId);
      }
      return { posted, eras: eras.length };
    });
    res.json(result);
  } catch (e) { next(e); }
});

r.get('/', requireRole('owner', 'biller'), async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT r.id, r.era_ref, r.total, r.received_at, r.posted_at,
                ip.name AS payer_name, count(l.id)::int AS line_count
         FROM remittances r
         LEFT JOIN insurance_payers ip ON ip.id = r.payer_id
         LEFT JOIN remittance_lines l ON l.remittance_id = r.id
         GROUP BY r.id, ip.name ORDER BY r.received_at DESC LIMIT 100`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/:id', requireRole('owner', 'biller'), async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT l.*, cl.claim_number, c.first_name || ' ' || c.last_name AS client_name
         FROM remittance_lines l
         JOIN claims cl ON cl.id = l.claim_id
         JOIN clients c ON c.id = cl.client_id
         WHERE l.remittance_id = $1`, [req.params.id]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

export default r;
