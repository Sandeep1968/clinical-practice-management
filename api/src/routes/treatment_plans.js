import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

const withGoals = async (db, planId) => {
  const plan = await db.query(
    `SELECT tp.*, u.full_name AS clinician_name,
            c.first_name || ' ' || c.last_name AS client_name
     FROM treatment_plans tp
     JOIN clinicians cl ON cl.id = tp.clinician_id
     JOIN users u ON u.id = cl.user_id
     JOIN clients c ON c.id = tp.client_id
     WHERE tp.id = $1`, [planId]);
  if (!plan.rowCount) return null;
  const goals = await db.query(
    `SELECT * FROM treatment_goals WHERE plan_id = $1 ORDER BY seq`, [planId]);
  return { ...plan.rows[0], goals: goals.rows };
};

// Plans for a client (chart tab)
r.get('/client/:id', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT tp.id, tp.title, tp.version, tp.status, tp.start_date, tp.review_date,
                tp.signed_at, tp.client_ack_at, u.full_name AS clinician_name,
                (SELECT count(*)::int FROM treatment_goals g WHERE g.plan_id = tp.id) AS goal_count,
                (SELECT coalesce(round(avg(g.progress_pct)),0)::int FROM treatment_goals g WHERE g.plan_id = tp.id) AS avg_progress
         FROM treatment_plans tp
         JOIN clinicians cl ON cl.id = tp.clinician_id
         JOIN users u ON u.id = cl.user_id
         WHERE tp.client_id = $1 ORDER BY tp.created_at DESC`,
        [req.params.id]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Active plans across the clinician's caseload (module landing)
r.get('/', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT tp.id, tp.title, tp.status, tp.review_date, tp.signed_at,
                c.first_name || ' ' || c.last_name AS client_name, c.id AS client_id,
                (SELECT coalesce(round(avg(g.progress_pct)),0)::int FROM treatment_goals g WHERE g.plan_id = tp.id) AS avg_progress
         FROM treatment_plans tp JOIN clients c ON c.id = tp.client_id
         WHERE tp.status IN ('draft','active')
         ORDER BY tp.review_date NULLS LAST, tp.created_at DESC LIMIT 200`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const plan = await withTenant(req.ctx, (db) => withGoals(db, req.params.id));
    if (!plan) return res.status(404).json({ error: 'not found' });
    res.json(plan);
  } catch (e) { next(e); }
});

// Create plan with goals
r.post('/', requireRole('clinician'), async (req, res, next) => {
  try {
    const { clientId, title, presentingProblem, diagnoses = [], frequency, modality,
            reviewDate, goals = [] } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const created = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO treatment_plans
           (tenant_id, client_id, clinician_id, title, presenting_problem, diagnoses,
            frequency, modality, review_date)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [clientId, req.ctx.clinicianId, title || 'Treatment Plan', presentingProblem || null,
         JSON.stringify(diagnoses), frequency || null, modality || null, reviewDate || null]);
      const planId = rows[0].id;
      let seq = 1;
      for (const g of goals) {
        if (!g.goal?.trim()) continue;
        await db.query(
          `INSERT INTO treatment_goals (tenant_id, plan_id, seq, goal, objectives, interventions, target_date)
           VALUES (current_tenant(), $1, $2, $3, $4, $5, $6)`,
          [planId, seq++, g.goal, JSON.stringify(g.objectives || []), g.interventions || null, g.targetDate || null]);
      }
      await audit(db, req.ctx, 'PLAN_CREATE', 'treatment_plans', planId);
      return withGoals(db, planId);
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Update goal progress/status (allowed after signing — progress is expected to change)
r.patch('/goals/:goalId', requireRole('clinician'), async (req, res, next) => {
  try {
    const { status, progressPct } = req.body || {};
    const updated = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `UPDATE treatment_goals
            SET status = coalesce($1::goal_status, status),
                progress_pct = coalesce($2, progress_pct),
                updated_at = now()
          WHERE id = $3 RETURNING *`,
        [status || null, progressPct ?? null, req.params.goalId]);
      if (rows[0]) await audit(db, req.ctx, 'GOAL_UPDATE', 'treatment_goals', rows[0].id);
      return rows[0];
    });
    if (!updated) return res.status(404).json({ error: 'goal not found' });
    res.json(updated);
  } catch (e) { next(e); }
});

// Sign & activate — locks the plan content
r.post('/:id/sign', requireRole('clinician'), async (req, res, next) => {
  try {
    const signed = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `UPDATE treatment_plans
            SET signed_by = $1, signed_at = now(), locked = true, status = 'active'
          WHERE id = $2 AND locked = false RETURNING id`,
        [req.ctx.userId, req.params.id]);
      if (!rows[0]) return null;
      await audit(db, req.ctx, 'PLAN_SIGN', 'treatment_plans', req.params.id);
      return withGoals(db, req.params.id);
    });
    if (!signed) return res.status(409).json({ error: 'plan already signed or not yours' });
    res.json(signed);
  } catch (e) { next(e); }
});

// Revise → new version supersedes the old (old becomes 'completed')
r.post('/:id/revise', requireRole('clinician'), async (req, res, next) => {
  try {
    const revised = await withTenant(req.ctx, async (db) => {
      const prev = await withGoals(db, req.params.id);
      if (!prev) return null;
      const { rows } = await db.query(
        `INSERT INTO treatment_plans
           (tenant_id, client_id, clinician_id, version, supersedes_id, title, presenting_problem,
            diagnoses, frequency, modality, review_date)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [prev.client_id, req.ctx.clinicianId, prev.version + 1, prev.id, prev.title,
         prev.presenting_problem, JSON.stringify(prev.diagnoses), prev.frequency,
         prev.modality, req.body?.reviewDate || null]);
      const newId = rows[0].id;
      for (const g of prev.goals) {
        await db.query(
          `INSERT INTO treatment_goals (tenant_id, plan_id, seq, goal, objectives, interventions, target_date, status, progress_pct)
           VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8)`,
          [newId, g.seq, g.goal, JSON.stringify(g.objectives), g.interventions, g.target_date, g.status, g.progress_pct]);
      }
      await db.query(`UPDATE treatment_plans SET status = 'completed' WHERE id = $1`, [prev.id]);
      await audit(db, req.ctx, 'PLAN_REVISE', 'treatment_plans', newId);
      return withGoals(db, newId);
    });
    if (!revised) return res.status(404).json({ error: 'not found' });
    res.status(201).json(revised);
  } catch (e) { next(e); }
});

export default r;
