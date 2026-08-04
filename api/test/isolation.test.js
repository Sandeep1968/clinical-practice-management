// Cross-tenant and cross-clinician isolation tests.
//
// These are the most important tests in the repo. They assert that isolation is
// enforced by PostgreSQL RLS — i.e. a query with NO application-level filter
// still cannot see another tenant's or another clinician's data.
//
//   npm test      (requires the dev database to be running and migrated)
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgres://app_user:app_pass@localhost:5432/cpm';
const admin = process.env.MIGRATE_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cpm';

const TENANT_A = '11111111-1111-1111-1111-111111111111';   // seeded demo practice
const CLINICIAN_A = '33333333-3333-3333-3333-333333333331';
const CLIENT_ASSIGNED = '44444444-4444-4444-4444-444444444441';   // Jamie — assigned
const CLIENT_UNASSIGNED = '44444444-4444-4444-4444-444444444442'; // Morgan — not assigned

let pool, adminPool, TENANT_B, CLIENT_B;

// Run a query under a given RLS session context, exactly as the API does.
async function asContext({ tenantId, role, clinicianId, clientId }, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true),
              set_config('app.user_role',$3,true), set_config('app.clinician_id',$4,true),
              set_config('app.client_id',$5,true)`,
      [tenantId, '22222222-2222-2222-2222-222222222221', role,
       clinicianId || '00000000-0000-0000-0000-000000000000',
       clientId || '00000000-0000-0000-0000-000000000000']);
    const res = await c.query(sql, params);
    await c.query('COMMIT');
    return res;
  } finally { c.release(); }
}

before(async () => {
  pool = new pg.Pool({ connectionString: url });
  adminPool = new pg.Pool({ connectionString: admin });

  // second practice with its own patient, created out-of-band
  const t = await adminPool.query(
    `INSERT INTO tenants (name, subdomain) VALUES ('Rival Practice', 'rival-test')
     ON CONFLICT (subdomain) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
  TENANT_B = t.rows[0].id;
  const c = await adminPool.query(
    `INSERT INTO clients (tenant_id, first_name, last_name) VALUES ($1, 'Secret', 'Patient')
     RETURNING id`, [TENANT_B]);
  CLIENT_B = c.rows[0].id;
});

after(async () => {
  await adminPool.query(`DELETE FROM clients WHERE tenant_id = $1`, [TENANT_B]);
  await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT_B]);
  await pool.end(); await adminPool.end();
});

describe('tenant isolation', () => {
  test('an unfiltered SELECT returns only the current tenant rows', async () => {
    const res = await asContext({ tenantId: TENANT_A, role: 'owner' }, 'SELECT id, tenant_id FROM clients');
    assert.ok(res.rows.length > 0, 'tenant A should see its own clients');
    assert.ok(res.rows.every(r => r.tenant_id === TENANT_A),
      'RLS leaked rows from another tenant on an unfiltered query');
  });

  test('tenant A cannot read a tenant B record even by explicit id', async () => {
    const res = await asContext({ tenantId: TENANT_A, role: 'owner' },
      'SELECT id FROM clients WHERE id = $1', [CLIENT_B]);
    assert.equal(res.rowCount, 0, 'cross-tenant read succeeded — critical isolation failure');
  });

  test('tenant A cannot update a tenant B record', async () => {
    const res = await asContext({ tenantId: TENANT_A, role: 'owner' },
      `UPDATE clients SET last_name = 'Hacked' WHERE id = $1 RETURNING id`, [CLIENT_B]);
    assert.equal(res.rowCount, 0, 'cross-tenant write succeeded — critical isolation failure');
  });

  test('tenant A cannot insert rows belonging to tenant B', async () => {
    await assert.rejects(
      () => asContext({ tenantId: TENANT_A, role: 'owner' },
        `INSERT INTO clients (tenant_id, first_name, last_name) VALUES ($1,'X','Y')`, [TENANT_B]),
      'WITH CHECK should reject writing into another tenant');
  });

  test('audit_log is append-only for the application role', async () => {
    await assert.rejects(
      () => asContext({ tenantId: TENANT_A, role: 'owner' }, `DELETE FROM audit_log`),
      'audit log must not be deletable by the application');
  });
});

describe('clinician isolation within a practice', () => {
  const ctx = { tenantId: TENANT_A, role: 'clinician', clinicianId: CLINICIAN_A };

  test('clinician sees only assigned clients on an unfiltered query', async () => {
    const res = await asContext(ctx, 'SELECT id FROM clients');
    const ids = res.rows.map(r => r.id);
    assert.ok(ids.includes(CLIENT_ASSIGNED), 'assigned client should be visible');
    assert.ok(!ids.includes(CLIENT_UNASSIGNED),
      'clinician saw a client they are not assigned to — isolation failure');
  });

  test('clinician cannot read an unassigned client by id', async () => {
    const res = await asContext(ctx, 'SELECT id FROM clients WHERE id = $1', [CLIENT_UNASSIGNED]);
    assert.equal(res.rowCount, 0);
  });

  test('owner CAN see all clients in their own practice', async () => {
    const res = await asContext({ tenantId: TENANT_A, role: 'owner' }, 'SELECT id FROM clients');
    const ids = res.rows.map(r => r.id);
    assert.ok(ids.includes(CLIENT_ASSIGNED) && ids.includes(CLIENT_UNASSIGNED));
  });
});

describe('patient portal isolation', () => {
  const ctx = { tenantId: TENANT_A, role: 'client', clientId: CLIENT_ASSIGNED };

  test('portal session sees only its own client row', async () => {
    const res = await asContext(ctx, 'SELECT id FROM clients');
    assert.equal(res.rowCount, 1);
    assert.equal(res.rows[0].id, CLIENT_ASSIGNED);
  });

  test('portal session cannot read another patient appointments', async () => {
    const res = await asContext(ctx,
      'SELECT id FROM appointments WHERE client_id = $1', [CLIENT_UNASSIGNED]);
    assert.equal(res.rowCount, 0);
  });

  test('portal session cannot see unsigned treatment plans', async () => {
    const res = await asContext(ctx, 'SELECT id FROM treatment_plans WHERE signed_at IS NULL');
    assert.equal(res.rowCount, 0, 'draft plans must not be visible to patients');
  });
});
