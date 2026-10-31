import { defineConfig, devices } from '@playwright/test';

const port = 4322;
const baseURL = `http://127.0.0.1:${port}`;

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
      command: 'pnpm exec astro dev --port 4322 --host 127.0.0.1 --force',
      url: `${baseURL}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: '.',
      env: {
        ...process.env,
        VITEST: '',
        SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY:
          process.env.SUPABASE_ANON_KEY ||
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        ADMIN_TO_WEB_SIGNING_SECRET:
          process.env.ADMIN_TO_WEB_SIGNING_SECRET || 'admin-web-signing-secret-for-local-dev-only-32',
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:4321',
        PUBLIC_ADMIN_URL: baseURL,
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
        DATABASE_URL:
          process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
        ADMIN_TO_WEB_SIGNING_SECRET:
          process.env.ADMIN_TO_WEB_SIGNING_SECRET || 'admin-web-signing-secret-for-local-dev-only-32',
        PUBLIC_SITE_URL: 'http://127.0.0.1:4321',
        PUBLIC_ADMIN_URL: baseURL,
        PUBLIC_BOOKING_OPEN: 'true',
        VIVA_ENV: 'demo',
        PUBLIC_TURNSTILE_SITE_KEY:
          process.env.PUBLIC_TURNSTILE_SITE_KEY || '1x0000000000000000000000000000000AA',
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
