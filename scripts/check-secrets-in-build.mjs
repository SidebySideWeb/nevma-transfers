#!/usr/bin/env node
/**
 * AC-24: build web + admin and ensure client output does not contain secret values.
 * Reads values from the environment; never prints them.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const secrets = [
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
  { name: 'VIVA_CLIENT_SECRET', value: process.env.VIVA_CLIENT_SECRET || '' },
  { name: 'VIVA_API_KEY', value: process.env.VIVA_API_KEY || '' },
  { name: 'ADMIN_TO_WEB_SIGNING_SECRET', value: process.env.ADMIN_TO_WEB_SIGNING_SECRET || '' },
].filter((s) => s.value && s.value.length >= 8);

if (!secrets.length) {
  console.log(
    'AC-24: no preview secret values in env (need SUPABASE_SERVICE_ROLE_KEY, VIVA_CLIENT_SECRET, VIVA_API_KEY, ADMIN_TO_WEB_SIGNING_SECRET). Skipping with fail so CI does not silently pass.',
  );
  process.exit(1);
}

function run(cmd, args, cwd, env) {
  const res = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', shell: true });
  if (res.status !== 0) {
    console.error(`Build failed: ${cmd} ${args.join(' ')}`);
    if (res.stderr) process.stderr.write(res.stderr.slice(-2000));
    process.exit(res.status ?? 1);
  }
}

const env = { ...process.env };
console.log('Building @tem/web and @tem/admin (secrets not logged)…');
run('pnpm', ['--filter', '@tem/web', 'build'], root, env);
run('pnpm', ['--filter', '@tem/admin', 'build'], root, env);

const clientRoots = [
  join(root, 'apps/web/dist/client'),
  join(root, 'apps/web/dist'),
  join(root, 'apps/admin/dist/client'),
].filter((p) => existsSync(p));

const offenders = [];

function walk(dir, app) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip server output for admin/web when scanning client-only paths.
      if (name === 'server' || name === 'chunks') {
        // still scan client chunks under dist/client only
      }
      walk(full, app);
    } else if (/\.(js|mjs|cjs|css|html|json|map)$/.test(name)) {
      // Only scan browser-facing trees
      const rel = relative(root, full).replace(/\\/g, '/');
      const isClient =
        rel.includes('/dist/client/') ||
        (rel.includes('apps/web/dist/') && !rel.includes('/server/') && /\.(js|html|css)$/.test(name));
      if (!isClient && !rel.includes('/dist/client/')) continue;
      const text = readFileSync(full, 'utf8');
      for (const s of secrets) {
        if (text.includes(s.value)) offenders.push(`${rel} contains ${s.name}`);
      }
    }
  }
}

for (const r of clientRoots) walk(r, r);
if (offenders.length) {
  console.log('AC-24 FAIL: secret value(s) found in client build output:');
  for (const o of offenders) console.log(' -', o);
  process.exit(1);
}
console.log(`AC-24 PASS: scanned client output; none of ${secrets.length} secret values present.`);
