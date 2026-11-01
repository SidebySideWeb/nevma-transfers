#!/usr/bin/env node
/**
 * AC-29 (+ AC-24 kit 2): client build must not contain Sanity tokens, service role, or deploy hook URL.
 * Values are read from env and never printed. Also verifies the Viewer read token cannot create documents (403).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(join(root, 'apps/web/.env'));
loadEnvFile(join(root, 'apps/admin/.env'));

const secrets = [
  { name: 'SANITY_READ_TOKEN', value: process.env.SANITY_READ_TOKEN || '' },
  { name: 'SANITY_WRITE_TOKEN', value: process.env.SANITY_WRITE_TOKEN || '' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
  { name: 'TEM_WEB_DEPLOY_HOOK_URL', value: process.env.TEM_WEB_DEPLOY_HOOK_URL || '' },
].filter((s) => s.value && s.value.length >= 8);

if (!secrets.length) {
  console.error(
    'AC-29: need at least one of SANITY_READ_TOKEN / SANITY_WRITE_TOKEN / SUPABASE_SERVICE_ROLE_KEY / TEM_WEB_DEPLOY_HOOK_URL in env.',
  );
  process.exit(1);
}

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    console.error(`Build failed: ${cmd} ${args.join(' ')}`);
    if (res.stderr) process.stderr.write(res.stderr.slice(-2000));
    process.exit(res.status ?? 1);
  }
}

const skipBuild = process.argv.includes('--skip-build');
if (!skipBuild) {
  console.log('Building @tem/web and @tem/admin (secret values not logged)…');
  run('pnpm', ['--filter', '@tem/web', 'build'], root);
  run('pnpm', ['--filter', '@tem/admin', 'build'], root);
}

const clientRoots = [
  join(root, 'apps/web/dist/client'),
  join(root, 'apps/web/dist'),
  join(root, 'apps/web/.vercel/output/static'),
  join(root, 'apps/admin/dist/client'),
  join(root, 'apps/admin/dist'),
].filter((p) => existsSync(p));

const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'server') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(js|mjs|cjs|css|html|json|map)$/.test(name)) continue;
    const rel = relative(root, full).replace(/\\/g, '/');
    if (rel.includes('/server/')) continue;
    const text = readFileSync(full, 'utf8');
    for (const s of secrets) {
      if (text.includes(s.value)) offenders.push(`${rel} contains ${s.name}`);
    }
  }
}

for (const r of clientRoots) walk(r);

if (offenders.length) {
  console.error('AC-29 FAIL: secret value(s) found in client build output:');
  for (const o of offenders) console.error(' -', o);
  process.exit(1);
}
console.log(
  `AC-29 PASS: scanned client output; none of ${secrets.length} secret name(s) present (values not printed).`,
);

// Viewer read token must not create documents.
const projectId = process.env.SANITY_PROJECT_ID || '';
const dataset = process.env.SANITY_DATASET || '';
const readToken = process.env.SANITY_READ_TOKEN || '';
if (!projectId || !dataset || !readToken) {
  console.error('AC-29 FAIL: SANITY_PROJECT_ID / SANITY_DATASET / SANITY_READ_TOKEN required for write-403 check.');
  process.exit(1);
}

const mutateUrl = `https://${projectId}.api.sanity.io/v2025-01-01/data/mutate/${encodeURIComponent(dataset)}`;
const probeId = `qa-probe-${Date.now()}`;
const res = await fetch(mutateUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${readToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mutations: [
      {
        create: {
          _id: probeId,
          _type: 'formSubmission',
          status: 'new',
          internalNote: 'QA probe — should be rejected',
        },
      },
    ],
  }),
});

if (res.status === 403 || res.status === 401) {
  console.log(`AC-29 PASS: read token create → HTTP ${res.status} (forbidden as required).`);
  process.exit(0);
}

// Clean up if the "read" token unexpectedly wrote (do not leave junk).
const cleanupToken = process.env.SANITY_WRITE_TOKEN || readToken;
if (res.ok && cleanupToken) {
  await fetch(mutateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanupToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations: [{ delete: { id: probeId } }] }),
  });
  console.error(
    `AC-29 FAIL: SANITY_READ_TOKEN create returned HTTP ${res.status} (expected 403). Probe deleted. Replace the read token with a Viewer-only robot.`,
  );
} else {
  console.error(`AC-29 FAIL: read token create returned HTTP ${res.status} (expected 403).`);
}
process.exit(1);
