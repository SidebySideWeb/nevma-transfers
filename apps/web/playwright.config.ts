import { defineConfig, devices } from '@playwright/test';

const port = 4321;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'pnpm exec astro dev stop 2>nul & pnpm exec astro dev --port 4321 --host 127.0.0.1 --force',
    url: `${baseURL}/book`,
    // Fresh server so TURNSTILE dummy keys and DATABASE_URL from this config win over a leftover .env server.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      // Astro skips its page middleware when VITEST is set (see vite-plugin-astro-server).
      VITEST: '',
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:54329/postgres',
      PUBLIC_TURNSTILE_SITE_KEY:
        process.env.PUBLIC_TURNSTILE_SITE_KEY || '1x0000000000000000000000000000000AA',
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA',
      PUBLIC_SITE_URL: baseURL,
      PUBLIC_ADMIN_URL: 'http://127.0.0.1:4322',
      PUBLIC_BOOKING_OPEN: 'true',
    },
  },

  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});

