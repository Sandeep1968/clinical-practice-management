import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// ---------- service codes / fee schedule ----------
r.get('/service-codes', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(`SELECT * FROM service_codes WHERE active ORDER BY cpt`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/service-codes', requireRole('owner', 'admin', 'biller'), async (req, res, next) => {
  try {
    const { cpt, description, defaultRate, durationMinutes = 50 } = req.body || {};
    if (!cpt || !description || defaultRate == null)
      return res.status(400).json({ error: 'cpt, description and defaultRate required' });
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `INSERT INTO service_codes (tenant_id, cpt, description, default_rate, duration_minutes)
         VALUES (current_tenant(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id, cpt) DO UPDATE
           SET description = EXCLUDED.description, default_rate = EXCLUDED.default_rate,
               duration_minutes = EXCLUDED.duration_minutes, active = true
         RETURNING *`,
        [cpt, description, defaultRate, durationMinutes]).then(x => x.rows[0]));
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// ---------- sliding scale / self-pay agreements ----------
r.get('/fee-agreement/:clientId', async (req, res, next) => {
  try {
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT * FROM client_fee_agreements WHERE client_id = $1
         ORDER BY effective_from DESC LIMIT 1`, [req.params.clientId]).then(x => x.rows[0]));
    res.json(row || { pay_type: 'insurance' });
  } catch (e) { next(e); }
});

r.post('/fee-agreement', requireRole('owner', 'admin', 'biller', 'clinician'), async (req, res, next) => {
  try {
    const { clientId, payType = 'insurance', slidingRate, discountPct, notes } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const row = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO client_fee_agreements (tenant_id, client_id, pay_type, sliding_rate, discount_pct, notes)
         VALUES (current_tenant(), $1, $2, $3, $4, $5) RETURNING *`,
        [clientId, payType, slidingRate || null, discountPct || null, notes || null]);
      await audit(db, req.ctx, 'FEE_AGREEMENT', 'client_fee_agreements', rows[0].id);
      return rows[0];
    });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// Effective rate for a client + CPT (sliding scale beats discount beats standard)
async function effectiveRate(db, clientId, cpt) {
  const svc = await db.query(`SELECT default_rate FROM service_codes WHERE cpt = $1`, [cpt]);
  const base = Number(svc.rows[0]?.default_rate || 0);
  const fa = await db.query(
    `SELECT * FROM client_fee_agreements WHERE client_id = $1 ORDER BY effective_from DESC LIMIT 1`, [clientId]);
  const a = fa.rows[0];
  if (!a) return { rate: base, basis: 'standard' };
  if (a.sliding_rate != null) return { rate: Number(a.sliding_rate), basis: 'sliding scale' };
  if (a.discount_pct != null) return { rate: Math.round(base * (1 - a.discount_pct / 100) * 100) / 100, basis: `${a.discount_pct}% discount` };
  return { rate: base, basis: 'standard' };
}

r.get('/rate', async (req, res, next) => {
  try {
    const { clientId, cpt } = req.query;
    if (!clientId || !cpt) return res.status(400).json({ error: 'clientId and cpt required' });
    const out = await withTenant(req.ctx, (db) => effectiveRate(db, clientId, cpt));
    res.json(out);
  } catch (e) { next(e); }
});

// ---------- Good Faith Estimate (No Surprises Act) ----------
// Required for self-pay / uninsured clients BEFORE service.
r.get('/gfe/client/:clientId', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(`SELECT * FROM good_faith_estimates WHERE client_id = $1 ORDER BY issued_at DESC`,
        [req.params.clientId]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Clients who are self-pay and have no current GFE — a compliance work queue
r.get('/gfe/needed', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT c.id, c.first_name || ' ' || c.last_name AS client_name, fa.pay_type
         FROM clients c
         JOIN LATERAL (
           SELECT pay_type FROM client_fee_agreements f
            WHERE f.client_id = c.id ORDER BY effective_from DESC LIMIT 1
         ) fa ON true
         WHERE c.status = 'active' AND fa.pay_type IN ('self_pay','sliding_scale')
           AND NOT EXISTS (
             SELECT 1 FROM good_faith_estimates g
              WHERE g.client_id = c.id AND g.issued_at > now() - interval '12 months')`)
        .then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/gfe', requireRole('owner', 'admin', 'biller', 'clinician'), async (req, res, next) => {
  try {
    const { clientId, clinicianId, serviceCpt, diagnosisCodes = [],
            expectedSessions = 12, periodMonths = 12, notes } = req.body || {};
    if (!clientId || !serviceCpt) return res.status(400).json({ error: 'clientId and serviceCpt required' });

    const gfe = await withTenant(req.ctx, async (db) => {
      const svc = await db.query(`SELECT description FROM service_codes WHERE cpt = $1`, [serviceCpt]);
      const { rate, basis } = await effectiveRate(db, clientId, serviceCpt);
      const total = Math.round(rate * expectedSessions * 100) / 100;
      const { rows } = await db.query(
        `INSERT INTO good_faith_estimates
           (tenant_id, client_id, clinician_id, diagnosis_codes, service_cpt, service_description,
            rate_per_session, expected_sessions, total_estimate, period_months, notes)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [clientId, clinicianId || null, JSON.stringify(diagnosisCodes), serviceCpt,
         svc.rows[0]?.description || serviceCpt, rate, expectedSessions, total, periodMonths,
         notes || `Rate basis: ${basis}. This is an estimate only; actual charges may vary.`]);
      await audit(db, req.ctx, 'GFE_ISSUE', 'good_faith_estimates', rows[0].id);
      return rows[0];
    });
    res.status(201).json(gfe);
  } catch (e) { next(e); }
});

r.post('/gfe/:id/deliver', async (req, res, next) => {
  try {
    await withTenant(req.ctx, (db) =>
      db.query(`UPDATE good_faith_estimates SET delivered_at = now() WHERE id = $1`, [req.params.id]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- superbill ----------
r.post('/superbills', async (req, res, next) => {
  try {
    const { clientId, periodStart, periodEnd } = req.body || {};
    if (!clientId || !periodStart || !periodEnd)
      return res.status(400).json({ error: 'clientId, periodStart and periodEnd required' });

    const sb = await withTenant(req.ctx, async (db) => {
      const enc = await db.query(
        `SELECT e.dos, e.cpt_codes, e.icd_codes, e.rate, e.clinician_id
         FROM encounters e
         WHERE e.client_id = $1 AND e.dos BETWEEN $2 AND $3 AND e.status IN ('signed','billed')
         ORDER BY e.dos`, [clientId, periodStart, periodEnd]);
      if (!enc.rowCount) return null;

      const codes = await db.query(`SELECT cpt, description FROM service_codes`);
      const descOf = (cpt) => codes.rows.find(c => c.cpt === cpt)?.description || cpt;

      const lines = enc.rows.map(e => {
        const cpt = (e.cpt_codes || [])[0] || '';
        return {
          dos: e.dos, cpt, description: descOf(cpt), units: 1,
          rate: Number(e.rate || 0), amount: Number(e.rate || 0), icd: e.icd_codes || []
        };
      });
      const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

      const { rows } = await db.query(
        `INSERT INTO superbills (tenant_id, client_id, clinician_id, period_start, period_end, lines, total)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [clientId, enc.rows[0].clinician_id, periodStart, periodEnd, JSON.stringify(lines), total]);
      await audit(db, req.ctx, 'SUPERBILL', 'superbills', rows[0].id);
      return rows[0];
    });
    if (!sb) return res.status(404).json({ error: 'no signed encounters in that period' });
    res.status(201).json(sb);
  } catch (e) { next(e); }
});

r.get('/superbills/:id', async (req, res, next) => {
  try {
    const row = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT s.*, c.first_name || ' ' || c.last_name AS client_name, c.dob, c.address,
                u.full_name AS clinician_name, cl.npi, cl.license_no,
                b.display_name AS practice_name, b.rx_header AS practice_address,
                b.tax_id, b.group_npi, b.place_of_service
         FROM superbills s
         JOIN clients c ON c.id = s.client_id
         LEFT JOIN clinicians cl ON cl.id = s.clinician_id
         LEFT JOIN users u ON u.id = cl.user_id
         LEFT JOIN branding b ON b.tenant_id = s.tenant_id
         WHERE s.id = $1`, [req.params.id]).then(x => x.rows[0]));
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (e) { next(e); }
});

r.get('/superbills', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT s.id, s.period_start, s.period_end, s.total, s.generated_at,
                c.first_name || ' ' || c.last_name AS client_name
         FROM superbills s JOIN clients c ON c.id = s.client_id
         ORDER BY s.generated_at DESC LIMIT 100`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// ---------- statements ----------
r.post('/statements', requireRole('owner', 'admin', 'biller'), async (req, res, next) => {
  try {
    const { clientId, periodStart, periodEnd } = req.body || {};
    if (!clientId || !periodStart || !periodEnd)
      return res.status(400).json({ error: 'clientId, periodStart and periodEnd required' });

    const st = await withTenant(req.ctx, async (db) => {
      const inv = await db.query(
        `SELECT created_at::date AS d, amount, balance FROM invoices
          WHERE client_id = $1 AND created_at::date BETWEEN $2 AND $3 ORDER BY created_at`,
        [clientId, periodStart, periodEnd]);
      const pay = await db.query(
        `SELECT at::date AS d, amount, method FROM payments
          WHERE client_id = $1 AND at::date BETWEEN $2 AND $3 ORDER BY at`,
        [clientId, periodStart, periodEnd]);

      const charges = inv.rows.reduce((s, i) => s + Number(i.amount), 0);
      const payments = pay.rows.reduce((s, p) => s + Number(p.amount), 0);
      const bal = await db.query(
        `SELECT coalesce(sum(balance),0)::numeric(10,2) AS b FROM invoices WHERE client_id = $1`, [clientId]);

      const lines = [
        ...inv.rows.map(i => ({ date: i.d, type: 'charge', amount: Number(i.amount) })),
        ...pay.rows.map(p => ({ date: p.d, type: `payment (${p.method})`, amount: -Number(p.amount) }))
      ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const { rows } = await db.query(
        `INSERT INTO statements (tenant_id, client_id, period_start, period_end, charges, payments, balance, lines)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [clientId, periodStart, periodEnd, charges, payments, bal.rows[0].b, JSON.stringify(lines)]);
      await audit(db, req.ctx, 'STATEMENT', 'statements', rows[0].id);
      return rows[0];
    });
    res.status(201).json(st);
  } catch (e) { next(e); }
});

r.get('/statements', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT s.*, c.first_name || ' ' || c.last_name AS client_name
         FROM statements s JOIN clients c ON c.id = s.client_id
         ORDER BY s.generated_at DESC LIMIT 100`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// ---------- CMS-1500 field map for a claim (printable professional claim form) ----------
r.get('/cms1500/:claimId', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT cl.claim_number, cl.dos, cl.rate,
                c.first_name, c.last_name, c.dob, c.address, c.phone,
                p.member_id, p.group_no, ip.name AS payer_name,
                u.full_name AS provider_name, cln.npi AS provider_npi, cln.license_no,
                e.cpt_codes, e.icd_codes,
                b.display_name AS practice_name, b.rx_header AS practice_address,
                b.tax_id, b.group_npi, b.place_of_service
         FROM claims cl
         JOIN clients c ON c.id = cl.client_id
         JOIN encounters e ON e.id = cl.encounter_id
         JOIN clinicians cln ON cln.id = cl.provider_id
         JOIN users u ON u.id = cln.user_id
         LEFT JOIN client_policies p ON p.client_id = c.id AND p.rank = 1
         LEFT JOIN insurance_payers ip ON ip.id = cl.payer_id
         LEFT JOIN branding b ON b.tenant_id = cl.tenant_id
         WHERE cl.id = $1`, [req.params.claimId]).then(x => x.rows[0]));
    if (!data) return res.status(404).json({ error: 'claim not found' });

    // Map to the CMS-1500 (02/12) boxes the form actually needs
    res.json({
      box1a_insured_id: data.member_id,
      box2_patient_name: `${data.last_name}, ${data.first_name}`,
      box3_patient_dob: data.dob,
      box5_patient_address: data.address,
      box11_group_number: data.group_no,
      box21_diagnosis_codes: data.icd_codes || [],
      box24_service_lines: (data.cpt_codes || []).map(cpt => ({
        dos_from: data.dos, dos_to: data.dos,
        place_of_service: data.place_of_service || '11',
        cpt, charges: Number(data.rate), units: 1
      })),
      box25_federal_tax_id: data.tax_id,
      box28_total_charge: Number(data.rate),
      box31_provider_signature: data.provider_name,
      box32_service_facility: data.practice_address,
      box33_billing_provider: {
        name: data.practice_name, address: data.practice_address,
        npi: data.group_npi || data.provider_npi
      },
      box33a_npi: data.provider_npi,
      payer: data.payer_name,
      claim_number: data.claim_number,
      _note: 'Field map for CMS-1500 (02/12). Render onto the official form template for printing; electronic submission uses 837P.'
    });
  } catch (e) { next(e); }
});

export default r;
