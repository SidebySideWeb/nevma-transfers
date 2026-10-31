import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AC-24 admin build output contains no secrets', async ({}, testInfo) => {
  // Parallel phone/desktop both building races pnpm symlinks on Windows.
  test.skip(testInfo.project.name !== 'desktop', 'build once on desktop project');
  test.setTimeout(300_000);

  // Deliberate sentinel strings (not real JWTs) injected at build time; client must not contain them.
  const signing =
    process.env.ADMIN_TO_WEB_SIGNING_SECRET || 'admin-web-signing-secret-for-local-dev-only-32';
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'tem-test-service-role-sentinel-must-not-appear-in-client';
  const vivaSecret = process.env.VIVA_CLIENT_SECRET || 'viva-client-secret-must-not-appear';
  const anon =
    process.env.SUPABASE_ANON_KEY || 'tem-test-anon-sentinel-must-not-appear-in-client';

  execSync('pnpm --filter @tem/admin build', {
    cwd: path.join(root, '../..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: anon,
      ADMIN_TO_WEB_SIGNING_SECRET: signing,
      SUPABASE_SERVICE_ROLE_KEY: service,
      VIVA_CLIENT_SECRET: vivaSecret,
      PUBLIC_SITE_URL: 'http://127.0.0.1:4321',
      PUBLIC_ADMIN_URL: 'http://127.0.0.1:4322',
    },
  });

  const dist = path.join(root, 'dist');
  const clientDir = path.join(dist, 'client');
  const scanRoots = [clientDir, path.join(dist, 'server')].filter((d) => fs.existsSync(d));
  expect(scanRoots.length).toBeGreaterThan(0);

  const offenders: string[] = [];
  function walk(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(js|mjs|css|html|json)$/.test(name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes(service)) offenders.push(`${full}: service role`);
        if (text.includes(signing)) offenders.push(`${full}: signing secret`);
        if (text.includes(vivaSecret)) offenders.push(`${full}: viva secret`);
      }
    }
  }
  for (const r of scanRoots) walk(r);
  const clientOffenders = offenders.filter(
    (o) => o.includes(`${path.sep}client${path.sep}`) || o.includes('/client/'),
  );
  expect(clientOffenders, clientOffenders.join('\n')).toEqual([]);
});
