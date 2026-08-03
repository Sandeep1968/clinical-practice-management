// Tenant-scoped DB access. Every request runs inside a transaction that sets
// the RLS context (app.tenant_id / app.user_id / app.user_role / app.clinician_id)
// so PostgreSQL — not application code — enforces isolation.
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://app_user:app_pass@localhost:5432/cpm',
  max: 20,                       // per-pod pool; scale pods horizontally
  idleTimeoutMillis: 30000
});

export async function withTenant(ctx, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true),
                               set_config('app.user_id', $2, true),
                               set_config('app.user_role', $3, true),
                               set_config('app.clinician_id', $4, true)`,
      [ctx.tenantId, ctx.userId, ctx.role, ctx.clinicianId || '00000000-0000-0000-0000-000000000000']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function audit(client, ctx, action, entity, entityId) {
  await client.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id, ip)
     VALUES (current_tenant(), $1, $2, $3, $4, $5)`,
    [ctx.userId, action, entity, entityId, ctx.ip || null]);
}
