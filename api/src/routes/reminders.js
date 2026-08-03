import { Router } from 'express';
import { withTenant } from '../db.js';

const r = Router();

// Recent reminders (visibility for front desk / owner)
r.get('/', async (req, res, next) => {
  try {
    const rows = await withTenant(req.ctx, (db) =>
      db.query(
        `SELECT rm.id, rm.channel, rm.message, rm.send_at, rm.sent_at, rm.status,
                c.first_name || ' ' || c.last_name AS client_name
         FROM reminders rm JOIN clients c ON c.id = rm.client_id
         ORDER BY rm.send_at DESC LIMIT 100`).then(x => x.rows));
    res.json({ data: rows });
  } catch (e) { next(e); }
});

export default r;
