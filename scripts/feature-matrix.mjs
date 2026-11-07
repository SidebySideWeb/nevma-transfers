#!/usr/bin/env node
/**
 * B10: run the booking-v2 test suite under each feature-switch profile.
 *
 * Usage:
 *   node scripts/feature-matrix.mjs                  # fast suite, all profiles
 *   node scripts/feature-matrix.mjs --suite=unit     # + package vitest/node tests
 *   node scripts/feature-matrix.mjs --suite=e2e      # Playwright (needs DB + secrets)
 *   node scripts/feature-matrix.mjs --profile=legacy,full
 *   node scripts/feature-matrix.mjs --json=docs/.qa-matrix-last.json
 *
 * Exit 1 if any profile/suite fails.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_PROFILES } from './feature-profiles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function has(name) {
  return args.includes(`--${name}`);
}

const suite = flag('suite', 'fast'); // fast | unit | e2e
const only = (flag('profile', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const jsonOut = flag('json', resolve(root, 'docs/.qa-matrix-last.json'));
const profiles = only.length
  ? FEATURE_PROFILES.filter((p) => only.includes(p.id))
  : FEATURE_PROFILES;

if (!profiles.length) {
  console.error('No profiles matched. Known:', FEATURE_PROFILES.map((p) => p.id).join(', '));
  process.exit(2);
}

/** @type {{ name: string, cmd: string, args: string[], cwd?: string, when: string[] }[]} */
const SUITES = [
  {
    name: 'profiles-resolve',
    cmd: 'node',
    args: ['--test', 'scripts/feature-matrix.test.mjs'],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: 'bv-scenarios-unit',
    cmd: 'node',
    args: ['--test', 'scripts/bv-scenarios.test.mjs'],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: '@tem/features',
    cmd: 'pnpm',
    args: ['--filter', '@tem/features', 'test'],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: '@tem/pricing',
    cmd: 'pnpm',
    args: ['--filter', '@tem/pricing', 'test'],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: '@tem/geo',
    cmd: 'pnpm',
    args: ['--filter', '@tem/geo', 'test'],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: 'web-switch-off',
    cmd: 'pnpm',
    args: [
      '--filter',
      '@tem/web',
      'exec',
      'vitest',
      'run',
      'src/lib/server/corporate.test.ts',
      'src/lib/server/flight-tracking.test.ts',
      'src/lib/server/geo-api.test.ts',
      'src/lib/server/places-api.test.ts',
    ],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: 'admin-switch-off',
    cmd: 'pnpm',
    args: [
      '--filter',
      '@tem/admin',
      'exec',
      'vitest',
      'run',
      'src/lib/corporate.test.ts',
      'src/lib/drivers.test.ts',
    ],
    when: ['fast', 'unit', 'e2e'],
  },
  {
    name: 'email-templates',
    cmd: 'pnpm',
    args: ['--filter', '@tem/web', 'exec', 'vitest', 'run', 'src/lib/server/email.test.ts'],
    when: ['unit', 'e2e'],
  },
  {
    name: 'web-unit',
    cmd: 'pnpm',
    args: ['--filter', '@tem/web', 'test'],
    when: ['unit', 'e2e'],
  },
  {
    name: 'admin-unit',
    cmd: 'pnpm',
    args: ['--filter', '@tem/admin', 'test'],
    when: ['unit', 'e2e'],
  },
  {
    name: 'db-unit',
    cmd: 'pnpm',
    args: ['--filter', '@tem/db', 'test'],
    when: ['unit', 'e2e'],
  },
  {
    name: 'web-e2e-booking',
    cmd: 'pnpm',
    args: ['--filter', '@tem/web', 'exec', 'playwright', 'test', 'e2e/booking.spec.ts', '--project=desktop'],
    when: ['e2e'],
  },
  {
    name: 'admin-e2e-pricing',
    cmd: 'pnpm',
    args: ['--filter', '@tem/admin', 'exec', 'playwright', 'test', 'e2e/pricing-b5.spec.ts', '--project=desktop'],
    when: ['e2e'],
  },
];

function runOne(step, env) {
  const started = Date.now();
  const res = spawnSync(step.cmd, step.args, {
    cwd: step.cwd ? resolve(root, step.cwd) : root,
    env: { ...process.env, ...env, FORCE_COLOR: '0' },
    encoding: 'utf8',
    shell: true,
  });
  const ms = Date.now() - started;
  const ok = res.status === 0;
  if (!ok) {
    const tail = [res.stdout, res.stderr].filter(Boolean).join('\n').slice(-2500);
    console.error(`\n── ${step.name} failed (${ms} ms) ──\n${tail}\n`);
  } else {
    console.log(`  ✓ ${step.name} (${ms} ms)`);
  }
  return { name: step.name, ok, ms, status: res.status ?? 1 };
}

const results = [];
let failed = 0;

console.log(`B10 feature matrix · suite=${suite} · profiles=${profiles.map((p) => p.id).join(',')}`);

for (const profile of profiles) {
  console.log(`\n=== ${profile.id}: ${profile.label} ===`);
  const steps = SUITES.filter((s) => s.when.includes(suite));
  const stepResults = [];
  for (const step of steps) {
    // Profile-resolve / bv tests only need to run once (they import profiles themselves).
    if (
      (step.name === 'profiles-resolve' || step.name === 'bv-scenarios-unit') &&
      profile !== profiles[0]
    ) {
      continue;
    }
    const r = runOne(step, profile.env);
    stepResults.push(r);
    if (!r.ok) failed += 1;
  }
  results.push({
    id: profile.id,
    label: profile.label,
    env: profile.env,
    steps: stepResults,
    ok: stepResults.every((s) => s.ok),
  });
}

mkdirSync(dirname(jsonOut), { recursive: true });
writeFileSync(
  jsonOut,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      suite,
      failed,
      results,
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${jsonOut}`);
console.log(failed ? `\nFAIL: ${failed} step(s)` : '\nPASS: all matrix steps');
process.exit(failed ? 1 : 0);
