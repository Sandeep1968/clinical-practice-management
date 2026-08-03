import { Router } from 'express';
import { withTenant } from '../db.js';

const r = Router();

// RLS scopes these to the signed-in user / their role
r.get('/', async (req, res, next) => {
  try {
    const data = await withTenant(req.ctx, async (db) => {
      const { rows } = await db.query(
        `SELECT id, kind, title, body, link, read_at, created_at
         FROM notifications ORDER BY created_at DESC LIMIT 50`);
      const unread = rows.filter(n => !n.read_at).length;
      return { data: rows, unread };
    });
    res.json(data);
  } catch (e) { next(e); }
});

r.post('/:id/read', async (req, res, next) => {
  try {
    await withTenant(req.ctx, (db) =>
      db.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL`, [req.params.id]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/read-all', async (req, res, next) => {
  try {
    await withTenant(req.ctx, (db) =>
      db.query(`UPDATE notifications SET read_at = now() WHERE read_at IS NULL`));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
