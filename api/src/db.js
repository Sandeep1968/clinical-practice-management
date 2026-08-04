// Tenant-scoped DB access. Every request runs inside a transaction that sets
// the RLS context (app.tenant_id / app.user_id / app.user_role / app.clinician_id)
// so PostgreSQL — not application code — enforces isolation.
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: +(process.env.PG_POOL_MAX || 20),   // per-pod pool; scale pods horizontally
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // TLS to the database is required in production (transmission security)
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' }
    : undefined
});

pool.on('error', (err) => console.error(JSON.stringify(
  { level: 'error', scope: 'pg-pool', message: err.message })));

export async function withTenant(ctx, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true),
                               set_config('app.user_id', $2, true),
                               set_config('app.user_role', $3, true),
                               set_config('app.clinician_id', $4, true),
                               set_config('app.client_id', $5, true)`,
      [ctx.tenantId, ctx.userId, ctx.role,
       ctx.clinicianId || '00000000-0000-0000-0000-000000000000',
       ctx.clientId || '00000000-0000-0000-0000-000000000000']);
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
