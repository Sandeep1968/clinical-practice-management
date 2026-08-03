import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

// Work queue: unsigned notes (clinician sees own via RLS; owner sees all)
r.get('/unsigned', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `SELECT e.id, e.dos, e.status, c.first_name, c.last_name
         FROM encounters e JOIN clients c ON c.id = e.client_id
         WHERE e.status = 'note_pending' ORDER BY e.dos LIMIT 200`);
      return rows;
    });
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Save/update note draft (clinician only, own encounters via RLS)
r.put('/:id/note', requireRole('clinician'), async (req, res, next) => {
  try {
    const { templateType, finalText, aiDraft } = req.body || {};
    const note = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO notes (tenant_id, encounter_id, template_type, final_text, ai_draft)
         VALUES (current_tenant(), $1, $2, $3, $4)
         ON CONFLICT (encounter_id) DO UPDATE
           SET template_type = EXCLUDED.template_type,
               final_text = EXCLUDED.final_text,
               ai_draft = COALESCE(EXCLUDED.ai_draft, notes.ai_draft)
         WHERE notes.locked = false
         RETURNING *`,
        [req.params.id, templateType || 'SOAP', finalText || null, aiDraft || null]);
      if (rows[0]) await audit(db, req.ctx, 'NOTE_SAVE', 'notes', rows[0].id);
      return rows[0];
    });
    if (!note) return res.status(409).json({ error: 'note is locked (already signed)' });
    res.json(note);
  } catch (e) { next(e); }
});

// Sign note → locks it, releases encounter to billing, creates draft claim
r.post('/:id/sign', requireRole('clinician'), async (req, res, next) => {
  try {
    const { cptCodes = [], icdCodes = [], rate } = req.body || {};
    const result = await withTenant(req.ctx, async (db) => {
      const note = await db.query(
        `UPDATE notes SET signed_by = $1, signed_at = now(), locked = true
         WHERE encounter_id = $2 AND locked = false AND final_text IS NOT NULL
         RETURNING id`, [req.ctx.userId, req.params.id]);
      if (!note.rowCount) return null;

      const enc = await db.query(
        `UPDATE encounters SET status = 'signed', cpt_codes = $1, icd_codes = $2, rate = $3
         WHERE id = $4 RETURNING *`,
        [cptCodes, icdCodes, rate || null, req.params.id]);

      const e = enc.rows[0];
      const claim = await db.query(
        `INSERT INTO claims (tenant_id, encounter_id, client_id, provider_id, dos, rate, status)
         VALUES (current_tenant(), $1, $2, $3, $4, COALESCE($5, 0), 'draft') RETURNING id`,
        [e.id, e.client_id, e.clinician_id, e.dos, rate]);
      await db.query(
        `INSERT INTO claim_status_history (tenant_id, claim_id, to_status, source)
         VALUES (current_tenant(), $1, 'draft', 'system')`, [claim.rows[0].id]);

      await audit(db, req.ctx, 'NOTE_SIGN', 'encounters', req.params.id);
      return { encounter: e, claimId: claim.rows[0].id };
    });
    if (!result) return res.status(409).json({ error: 'note missing, already signed, or not yours' });
    res.json(result);
  } catch (e) { next(e); }
});

export default r;
