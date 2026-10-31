import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AC-24 admin build output contains no secrets', async () => {
  test.setTimeout(300_000);
  const signing =
    process.env.ADMIN_TO_WEB_SIGNING_SECRET || 'admin-web-signing-secret-for-local-dev-only-32';
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  const vivaSecret = process.env.VIVA_CLIENT_SECRET || 'viva-client-secret-must-not-appear';

  execSync('pnpm --filter @tem/admin build', {
    cwd: path.join(root, '../..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY:
        process.env.SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      ADMIN_TO_WEB_SIGNING_SECRET: signing,
      // Deliberately available in env during build — must not leak into client chunks.
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
  // Client bundle must never contain secrets; server may hold signing for internal calls.
  const clientOffenders = offenders.filter((o) => o.includes(`${path.sep}client${path.sep}`) || o.includes('/client/'));
  expect(clientOffenders, clientOffenders.join('\n')).toEqual([]);
});
