#!/usr/bin/env node
/** Runs AC-21 launch guard before production builds on Vercel. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL_ENV !== 'production') {
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const script = resolve(root, 'scripts/check-live-demo.mjs');
console.log('VERCEL_ENV=production — running launch guard (AC-21)…');
const res = spawnSync(process.execPath, [script], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
process.exit(res.status ?? 1);
