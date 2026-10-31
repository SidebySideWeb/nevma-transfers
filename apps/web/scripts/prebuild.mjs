#!/usr/bin/env node
/**
 * Runs AC-21 launch guard before production builds on Vercel.
 * Set SKIP_LAUNCH_GUARD=1 in Vercel while DEMO content remains (pre–go-live).
 * Remove it before launch so production cannot ship with DEMO leftovers.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL_ENV !== 'production') {
  process.exit(0);
}

if (process.env.SKIP_LAUNCH_GUARD === '1' || process.env.SKIP_LAUNCH_GUARD === 'true') {
  console.warn(
    'VERCEL_ENV=production but SKIP_LAUNCH_GUARD is set — skipping AC-21 launch guard (DEMO may still be present).',
  );
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
