import { Router } from 'express';
import { withTenant } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// Practice analytics summary (eka-style dashboard)
r.get('/summary', requireRole('owner', 'admin', 'biller'), async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const [revenue, appts, claims, noShow] = await Promise.all([
        db.query(
          `SELECT to_char(date_trunc('month', at), 'Mon YYYY') AS month,
                  sum(amount)::numeric(12,2) AS total
           FROM payments GROUP BY date_trunc('month', at)
           ORDER BY date_trunc('month', at) DESC LIMIT 6`),
        db.query(
          `SELECT status, count(*)::int AS count FROM appointments
           WHERE starts_at > now() - interval '30 days' GROUP BY status`),
        db.query(
          `SELECT status, count(*)::int AS count, coalesce(sum(rate),0)::numeric(12,2) AS value
           FROM claims GROUP BY status`),
        db.query(
          `SELECT count(*) FILTER (WHERE status = 'no_show')::float /
                  nullif(count(*) FILTER (WHERE status IN ('completed','no_show')), 0) AS rate
           FROM appointments WHERE starts_at > now() - interval '90 days'`)
      ]);
      return {
        revenueByMonth: revenue.rows.reverse(),
        appointments30d: appts.rows,
        claimsFunnel: claims.rows,
        noShowRate: noShow.rows[0]?.rate ?? null
      };
    });
    res.json(data);
  } catch (e) { next(e); }
});

export default r;
