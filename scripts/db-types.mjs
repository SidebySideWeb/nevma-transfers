#!/usr/bin/env node
/**
 * Generate Database types from the linked Supabase project into web + admin.
 * Requires: supabase login (or SUPABASE_ACCESS_TOKEN).
 * Alternative: SUPABASE_DB_URL for --db-url generation.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const webOut = resolve(root, 'apps/web/src/lib/server/database.types.ts');
const adminOut = resolve(root, 'apps/admin/src/lib/database.types.ts');
const projectId = process.env.SUPABASE_PROJECT_ID || 'cavasvtbiukqhscqrpuv';
const dbUrl = process.env.SUPABASE_DB_URL;

const args = dbUrl
  ? ['gen', 'types', 'typescript', '--db-url', dbUrl, '--schema', 'public']
  : ['gen', 'types', 'typescript', '--project-id', projectId, '--schema', 'public'];

const result = spawnSync('supabase', args, { encoding: 'utf8', shell: true });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'supabase gen types failed');
  process.exit(result.status ?? 1);
}

const idx = result.stdout.indexOf('export type Json');
if (idx < 0) {
  console.error('No TypeScript types found in supabase output');
  process.exit(1);
}

const types = result.stdout.slice(idx);
writeFileSync(webOut, types);
copyFileSync(webOut, adminOut);
console.log(`Wrote ${webOut}`);
console.log(`Wrote ${adminOut}`);
