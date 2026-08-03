import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

r.get('/templates', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(`SELECT id, name, kind, requires_signature FROM form_templates WHERE active ORDER BY name`)
        .then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/client/:id', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT d.*, u.full_name AS uploaded_by_name
         FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
         WHERE d.client_id = $1 ORDER BY d.created_at DESC`, [req.params.id]).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Work queue: documents awaiting signature across the practice
r.get('/pending', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT d.id, d.title, d.kind, d.created_at,
                c.first_name || ' ' || c.last_name AS client_name, c.id AS client_id
         FROM documents d JOIN clients c ON c.id = d.client_id
         WHERE d.status = 'pending_signature' ORDER BY d.created_at LIMIT 200`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Send a form/consent to a patient for signature
r.post('/send', requireRole('owner', 'admin', 'front_desk', 'clinician'), async (req, res, next) => {
  try {
    const { clientId, templateId } = req.body || {};
    if (!clientId || !templateId) return res.status(400).json({ error: 'clientId and templateId required' });
    const doc = await withTenant(req.ctx, async (db) => {
      const t = await db.query(`SELECT * FROM form_templates WHERE id = $1`, [templateId]);
      if (!t.rowCount) return null;
      const tpl = t.rows[0];
      const { rows } = await db.query(
        `INSERT INTO documents (tenant_id, client_id, uploaded_by, kind, title, body, status, requires_signature)
         VALUES (current_tenant(), $1, $2, $3, $4, $5,
                 CASE WHEN $6 THEN 'pending_signature'::doc_status ELSE 'received'::doc_status END, $6)
         RETURNING *`,
        [clientId, req.ctx.userId, tpl.kind, tpl.name, tpl.body, tpl.requires_signature]);
      await db.query(
        `INSERT INTO notifications (tenant_id, role_scope, kind, title, body, link)
         VALUES (current_tenant(), 'front_desk', 'system', 'Form sent to patient', $1, '/documents')`,
        [`${tpl.name} awaiting patient signature.`]);
      await audit(db, req.ctx, 'DOC_SEND', 'documents', rows[0].id);
      return rows[0];
    });
    if (!doc) return res.status(404).json({ error: 'template not found' });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// Record an upload (metadata; binary goes to object storage in production)
r.post('/', async (req, res, next) => {
  try {
    const { clientId, title, kind = 'upload', description, storageUri, mimeType, sizeBytes } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const doc = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO documents (tenant_id, client_id, uploaded_by, kind, title, description, storage_uri, mime_type, size_bytes)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [clientId || null, req.ctx.userId, kind, title, description || null,
         storageUri || null, mimeType || null, sizeBytes || null]);
      await audit(db, req.ctx, 'DOC_UPLOAD', 'documents', rows[0].id);
      return rows[0];
    });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// Staff countersignature
r.post('/:id/countersign', async (req, res, next) => {
  try {
    const ok = await withTenant(req.ctx, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE documents SET signed_by_staff = $1, signed_by_staff_at = now(),
                status = CASE WHEN signed_by_client_at IS NOT NULL THEN 'signed'::doc_status ELSE status END
          WHERE id = $2`, [req.ctx.userId, req.params.id]);
      if (rowCount) await audit(db, req.ctx, 'DOC_COUNTERSIGN', 'documents', req.params.id);
      return rowCount;
    });
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
