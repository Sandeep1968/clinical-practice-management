import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

r.get('/branding', async (req, res, next) => {
  try {
    const row = await withTenant(req.ctx, (db) =>
      db.query(`SELECT * FROM branding WHERE tenant_id = current_tenant()`).then(x => x.rows[0]));
    res.json(row || {});
  } catch (e) { next(e); }
});

r.put('/branding', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { displayName, logoUrl, primaryColor, rxHeader, rxFooter, portalWelcome, timezone } = req.body || {};
    const row = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO branding (tenant_id, display_name, logo_url, primary_color, rx_header, rx_footer, portal_welcome, timezone)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, logo_url = EXCLUDED.logo_url,
           primary_color = EXCLUDED.primary_color, rx_header = EXCLUDED.rx_header,
           rx_footer = EXCLUDED.rx_footer, portal_welcome = EXCLUDED.portal_welcome,
           timezone = EXCLUDED.timezone, updated_at = now()
         RETURNING *`,
        [displayName || null, logoUrl || null, primaryColor || '#2563EB', rxHeader || null,
         rxFooter || null, portalWelcome || null, timezone || 'America/Los_Angeles']);
      await audit(db, req.ctx, 'BRANDING_UPDATE', 'branding', req.ctx.tenantId);
      return rows[0];
    });
    res.json(row);
  } catch (e) { next(e); }
});

// ---------- clinical template library ----------
r.get('/templates', async (req, res, next) => {
  try {
    const { scope } = req.query;
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT * FROM clinical_templates
          WHERE active AND ($1::text IS NULL OR scope = $1) ORDER BY scope, name`,
        [scope || null]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/templates', requireRole('owner', 'admin', 'clinician'), async (req, res, next) => {
  try {
    const { scope = 'note', name, specialty, body = {} } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const row = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO clinical_templates (tenant_id, scope, name, specialty, body)
         VALUES (current_tenant(), $1, $2, $3, $4) RETURNING *`,
        [scope, name, specialty || null, JSON.stringify(body)]);
      return rows[0];
    });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

r.delete('/templates/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    await withTenant(req.ctx, (db) =>
      db.query(`UPDATE clinical_templates SET active = false WHERE id = $1`, [req.params.id]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
