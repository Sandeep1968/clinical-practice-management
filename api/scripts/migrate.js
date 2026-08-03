// Simple migration runner. Uses MIGRATE_DATABASE_URL (superuser) for DDL.
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo layout: ../../db/migrations — Docker layout: ../db/migrations
const dir = [join(__dirname, '..', '..', 'db', 'migrations'), join(__dirname, '..', 'db', 'migrations')]
  .find(existsSync);
if (!dir) { console.error('migrations directory not found'); process.exit(1); }
const url = process.env.MIGRATE_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cpm';
const seedOnly = process.argv.includes('--seed');

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, at TIMESTAMPTZ DEFAULT now())`);

for (const f of readdirSync(dir).sort()) {
  if (!f.endsWith('.sql')) continue;
  const isSeed = f.includes('seed');
  if (seedOnly !== isSeed) continue;
  const done = await client.query('SELECT 1 FROM _migrations WHERE name=$1', [f]);
  if (done.rowCount) { console.log('skip', f); continue; }
  console.log('apply', f);
  await client.query('BEGIN');
  try {
    await client.query(readFileSync(join(dir, f), 'utf8'));
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('FAILED', f, e.message);
    process.exit(1);
  }
}
await client.end();
console.log('done');
