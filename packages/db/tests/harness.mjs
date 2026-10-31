// Creates a throwaway database, applies the shim (if needed) and migrations 0001-0005, and drops it afterwards.
// Needs DATABASE_URL pointing to a PostgreSQL 16 server where the user may create databases,
// for example the local Supabase stack (`supabase start`) or a Docker postgres:16.
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const adminUrl = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/postgres';

export async function createTestDb({ seed = false } = {}) {
  const name = `tem_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 6 });

  const hasAuth = (await pool.query(`select 1 from pg_namespace where nspname = 'auth'`)).rowCount > 0;
  if (!hasAuth) await pool.query(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));

  const files = readdirSync(migrationsDir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (f.startsWith('0006_')) continue; // pg_cron: Supabase only
    await pool.query(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  if (seed) await pool.query(readFileSync(join(here, '..', 'seed', 'demo.sql'), 'utf8'));

  return {
    pool,
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

// Runs fn inside a transaction as a Supabase role, rolled back afterwards.
export async function asRole(pool, role, userId, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    if (userId) await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return await fn(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}
