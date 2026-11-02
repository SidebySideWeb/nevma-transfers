import { defineConfig, devices } from '@playwright/test';

const port = 4322;
const baseURL = `http://127.0.0.1:${port}`;

/** Local e2e needs keys from env (copy from `supabase status` into apps/admin/.env). Never commit JWTs. */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Set it in the environment or apps/admin/.env (use local Supabase keys from \`supabase status\`).`,
    );
  }
  return v;
}

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnon = process.env.SUPABASE_ANON_KEY || requireEnv('SUPABASE_ANON_KEY');
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const databaseUrl = process.env.DATABASE_URL || requireEnv('DATABASE_URL');
const signing =
  process.env.ADMIN_TO_WEB_SIGNING_SECRET || 'admin-web-signing-secret-for-local-dev-only-32';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node e2e/deploy-hook-mock.mjs',
      url: 'http://127.0.0.1:9876/',
      reuseExistingServer: true,
      timeout: 30_000,
      cwd: '.',
    },
    {
      command: 'pnpm exec astro dev --port 4322 --host 127.0.0.1 --force',
      url: `${baseURL}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: '.',
      env: {
        ...process.env,
        VITEST: '',
        FEATURE_DRIVERS: process.env.FEATURE_DRIVERS ?? 'true',
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnon,
        ADMIN_TO_WEB_SIGNING_SECRET: signing,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:4321',
        PUBLIC_ADMIN_URL: baseURL,
        TEM_WEB_DEPLOY_HOOK_URL: 'http://127.0.0.1:9876/',
      },
    },
    {
      command: 'pnpm --filter @tem/web exec astro dev --port 4321 --host 127.0.0.1 --force',
      url: 'http://127.0.0.1:4321/book',
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: '../..',
      env: {
        ...process.env,
        VITEST: '',
        DATABASE_URL: databaseUrl,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole,
        ADMIN_TO_WEB_SIGNING_SECRET: signing,
        PUBLIC_SITE_URL: 'http://127.0.0.1:4321',
        PUBLIC_ADMIN_URL: baseURL,
        PUBLIC_BOOKING_OPEN: 'true',
        VIVA_ENV: 'demo',
        TURNSTILE_SITE_KEY:
          process.env.TURNSTILE_SITE_KEY ||
          process.env.PUBLIC_TURNSTILE_SITE_KEY ||
          '1x0000000000000000000000000000000AA',
        TURNSTILE_SECRET_KEY:
          process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA',
      },
    },
  ],
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 } },
    },
  ],
});
