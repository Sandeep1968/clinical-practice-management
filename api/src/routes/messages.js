import { Router } from 'express';
import { withTenant, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { sendSms } from '../adapters/sms.js';

const r = Router();

// Inbox — threads with unread counts
r.get('/threads', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT t.id, t.subject, t.last_message_at, t.closed,
                c.first_name || ' ' || c.last_name AS client_name, c.id AS client_id,
                (SELECT count(*)::int FROM messages m
                  WHERE m.thread_id = t.id AND m.sender_kind = 'client' AND m.read_by_staff_at IS NULL) AS unread,
                (SELECT m.body FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS preview
         FROM message_threads t JOIN clients c ON c.id = t.client_id
         ORDER BY t.last_message_at DESC LIMIT 200`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/threads/:id', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const t = await db.query(
        `SELECT t.*, c.first_name || ' ' || c.last_name AS client_name
         FROM message_threads t JOIN clients c ON c.id = t.client_id WHERE t.id = $1`, [req.params.id]);
      if (!t.rowCount) return null;
      const m = await db.query(
        `SELECT m.*, u.full_name AS sender_name FROM messages m
         LEFT JOIN users u ON u.id = m.sender_user_id
         WHERE m.thread_id = $1 ORDER BY m.created_at`, [req.params.id]);
      await db.query(
        `UPDATE messages SET read_by_staff_at = now()
          WHERE thread_id = $1 AND sender_kind = 'client' AND read_by_staff_at IS NULL`, [req.params.id]);
      await audit(db, req.ctx, 'READ', 'message_threads', req.params.id);
      return { ...t.rows[0], messages: m.rows };
    });
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (e) { next(e); }
});

r.post('/threads', async (req, res, next) => {
  try {
    const { clientId, subject, body } = req.body || {};
    if (!clientId || !body?.trim()) return res.status(400).json({ error: 'clientId and body required' });
    const thread = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO message_threads (tenant_id, client_id, subject)
         VALUES (current_tenant(), $1, $2) RETURNING *`, [clientId, subject || 'Message from your clinic']);
      await db.query(
        `INSERT INTO messages (tenant_id, thread_id, sender_kind, sender_user_id, body)
         VALUES (current_tenant(), $1, 'staff', $2, $3)`, [rows[0].id, req.ctx.userId, body]);
      return rows[0];
    });
    res.status(201).json(thread);
  } catch (e) { next(e); }
});

r.post('/threads/:id/reply', async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });
    const msg = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO messages (tenant_id, thread_id, sender_kind, sender_user_id, body)
         VALUES (current_tenant(), $1, 'staff', $2, $3) RETURNING *`,
        [req.params.id, req.ctx.userId, body]);
      await db.query(`UPDATE message_threads SET last_message_at = now() WHERE id = $1`, [req.params.id]);
      return rows[0];
    });
    res.status(201).json(msg);
  } catch (e) { next(e); }
});

// ---------- broadcasts ----------
r.get('/broadcasts', requireRole('owner', 'admin', 'front_desk'), async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT b.*, u.full_name AS sent_by_name FROM broadcasts b
         LEFT JOIN users u ON u.id = b.sent_by ORDER BY b.sent_at DESC LIMIT 50`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.post('/broadcasts', requireRole('owner', 'admin', 'front_desk'), async (req, res, next) => {
  try {
    const { body, audience = 'all', channel = 'sms' } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: 'message body required' });

    const result = await withTenant(req.ctx, async (db) => {
      const filters = {
        all: 'TRUE',
        upcoming: `EXISTS (SELECT 1 FROM appointments a WHERE a.client_id = c.id
                            AND a.starts_at BETWEEN now() AND now() + interval '7 days'
                            AND a.status NOT IN ('cancelled','no_show'))`,
        outstanding_balance: `EXISTS (SELECT 1 FROM invoices i WHERE i.client_id = c.id AND i.balance > 0)`
      };
      const where = filters[audience] || 'TRUE';
      const { rows: targets } = await db.query(
        `SELECT c.id, c.phone, c.sms_consent FROM clients c WHERE c.status = 'active' AND ${where}`);

      let sent = 0, skipped = 0;
      for (const t of targets) {
        // TCPA: SMS only with consent + phone; portal messages always allowed
        if (channel === 'sms' && (!t.phone || !t.sms_consent)) { skipped++; continue; }
        if (channel === 'sms') {
          try { await sendSms({ to: t.phone, body }); sent++; }
          catch { skipped++; }
        } else {
          const th = await db.query(
            `INSERT INTO message_threads (tenant_id, client_id, subject)
             VALUES (current_tenant(), $1, 'Practice announcement') RETURNING id`, [t.id]);
          await db.query(
            `INSERT INTO messages (tenant_id, thread_id, sender_kind, sender_user_id, body)
             VALUES (current_tenant(), $1, 'staff', $2, $3)`, [th.rows[0].id, req.ctx.userId, body]);
          sent++;
        }
      }
      const { rows } = await db.query(
        `INSERT INTO broadcasts (tenant_id, sent_by, channel, audience, body, recipients, skipped)
         VALUES (current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.ctx.userId, channel, audience, body, sent, skipped]);
      await audit(db, req.ctx, 'BROADCAST', 'broadcasts', rows[0].id);
      return rows[0];
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default r;
