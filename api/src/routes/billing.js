import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// Outstanding balances work queue
r.get('/invoices', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT i.id, i.amount, i.balance, i.status, i.created_at,
                c.first_name || ' ' || c.last_name AS client_name, c.id AS client_id,
                (SELECT count(*)::int FROM payment_plans pp
                  WHERE pp.invoice_id = i.id AND pp.status = 'active') AS has_plan
         FROM invoices i JOIN clients c ON c.id = i.client_id
         WHERE i.balance > 0 ORDER BY i.created_at DESC LIMIT 200`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/invoices/:id/pay', requireRole('owner', 'admin', 'biller', 'front_desk'), async (req, res, next) => {
  try {
    const { amount, method = 'card' } = req.body || {};
    const result = await withTenant(req.ctx, async (db) => {
      const inv = await db.query(`SELECT * FROM invoices WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!inv.rowCount) return null;
      const pay = Math.min(Number(amount || inv.rows[0].balance), Number(inv.rows[0].balance));
      // PRODUCTION: charge via Stripe here using the stored payment method
      await db.query(
        `INSERT INTO payments (tenant_id, client_id, invoice_id, method, amount, processor_ref)
         VALUES (current_tenant(), $1, $2, $3, $4, $5)`,
        [inv.rows[0].client_id, inv.rows[0].id, method, pay, `MOCK-PAY-${Date.now()}`]);
      const { rows } = await db.query(
        `UPDATE invoices SET balance = balance - $1,
                status = CASE WHEN balance - $1 <= 0 THEN 'paid' ELSE 'partial' END
          WHERE id = $2 RETURNING *`, [pay, req.params.id]);
      await audit(db, req.ctx, 'PAYMENT', 'invoices', req.params.id);
      return rows[0];
    });
    if (!result) return res.status(404).json({ error: 'invoice not found' });
    res.json(result);
  } catch (e) { next(e); }
});

// ---------- payment plans ----------
r.get('/plans', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT pp.*, c.first_name || ' ' || c.last_name AS client_name,
                (SELECT count(*)::int FROM payment_plan_items i WHERE i.plan_id = pp.id AND i.paid_at IS NOT NULL) AS paid_count,
                (SELECT coalesce(sum(i.amount),0)::numeric(10,2) FROM payment_plan_items i
                  WHERE i.plan_id = pp.id AND i.paid_at IS NULL) AS remaining
         FROM payment_plans pp JOIN clients c ON c.id = pp.client_id
         ORDER BY pp.created_at DESC LIMIT 200`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/plans/:id', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const p = await db.query(
        `SELECT pp.*, c.first_name || ' ' || c.last_name AS client_name
         FROM payment_plans pp JOIN clients c ON c.id = pp.client_id WHERE pp.id = $1`, [req.params.id]);
      if (!p.rowCount) return null;
      const items = await db.query(
        `SELECT * FROM payment_plan_items WHERE plan_id = $1 ORDER BY seq`, [req.params.id]);
      return { ...p.rows[0], items: items.rows };
    });
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (e) { next(e); }
});

// Create an installment plan against an invoice
r.post('/plans', requireRole('owner', 'admin', 'biller'), async (req, res, next) => {
  try {
    const { invoiceId, installments = 3, cadence = 'monthly', autoCharge = false, startDate } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const n = Math.max(2, Math.min(24, +installments));

    const plan = await withTenant(req.ctx, async (db) => {
      const inv = await db.query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId]);
      if (!inv.rowCount) return null;
      const total = Number(inv.rows[0].balance);
      const { rows } = await db.query(
        `INSERT INTO payment_plans (tenant_id, client_id, invoice_id, total_amount, installments, cadence, auto_charge)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [inv.rows[0].client_id, invoiceId, total, n, cadence, !!autoCharge]);

      const per = Math.floor((total / n) * 100) / 100;
      const start = startDate ? new Date(startDate) : new Date();
      const stepDays = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 30;
      for (let i = 0; i < n; i++) {
        const due = new Date(start.getTime() + i * stepDays * 864e5);
        // last installment absorbs rounding
        const amt = i === n - 1 ? Math.round((total - per * (n - 1)) * 100) / 100 : per;
        await db.query(
          `INSERT INTO payment_plan_items (tenant_id, plan_id, seq, due_date, amount)
           VALUES (current_tenant(), $1, $2, $3, $4)`,
          [rows[0].id, i + 1, due.toISOString().slice(0, 10), amt]);
      }
      await audit(db, req.ctx, 'PLAN_CREATE', 'payment_plans', rows[0].id);
      return rows[0];
    });
    if (!plan) return res.status(404).json({ error: 'invoice not found' });
    res.status(201).json(plan);
  } catch (e) { next(e); }
});

// Pay one installment
r.post('/plans/items/:itemId/pay', async (req, res, next) => {
  try {
    const paid = await withTenant(req.ctx, async (db) => {
      const it = await db.query(
        `SELECT i.*, pp.client_id, pp.invoice_id, pp.id AS plan_id
         FROM payment_plan_items i JOIN payment_plans pp ON pp.id = i.plan_id
         WHERE i.id = $1 AND i.paid_at IS NULL FOR UPDATE OF i`, [req.params.itemId]);
      if (!it.rowCount) return null;
      const item = it.rows[0];
      const pay = await db.query(
        `INSERT INTO payments (tenant_id, client_id, invoice_id, method, amount, processor_ref)
         VALUES (current_tenant(), $1, $2, 'card', $3, $4) RETURNING id`,
        [item.client_id, item.invoice_id, item.amount, `MOCK-PLAN-${Date.now()}`]);
      await db.query(
        `UPDATE payment_plan_items SET paid_at = now(), status = 'paid', payment_id = $1 WHERE id = $2`,
        [pay.rows[0].id, req.params.itemId]);
      if (item.invoice_id) {
        await db.query(
          `UPDATE invoices SET balance = greatest(balance - $1, 0),
                  status = CASE WHEN balance - $1 <= 0 THEN 'paid' ELSE 'partial' END
            WHERE id = $2`, [item.amount, item.invoice_id]);
      }
      const left = await db.query(
        `SELECT count(*)::int AS n FROM payment_plan_items WHERE plan_id = $1 AND paid_at IS NULL`, [item.plan_id]);
      if (left.rows[0].n === 0)
        await db.query(`UPDATE payment_plans SET status = 'completed' WHERE id = $1`, [item.plan_id]);
      await audit(db, req.ctx, 'PLAN_INSTALLMENT_PAID', 'payment_plan_items', req.params.itemId);
      return true;
    });
    if (!paid) return res.status(404).json({ error: 'installment not found or already paid' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
