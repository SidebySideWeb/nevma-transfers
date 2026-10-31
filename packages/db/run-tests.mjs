#!/usr/bin/env node
// Runs the database tests when DATABASE_URL is set; otherwise explains how and exits 0
// so `pnpm test` works without Postgres. The CI `db` job sets DATABASE_URL and runs them.
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.log(
    '@tem/db: skipped — set DATABASE_URL to a PostgreSQL 16 server to run the database tests (see packages/db/README.md).',
  );
  process.exit(0);
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/*.test.mjs'], { stdio: 'inherit', cwd: import.meta.dirname });
process.exit(r.status ?? 1);
