import { defineConfig, devices } from '@playwright/test';

const port = 4321;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/v2',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    // Vercel adapter has no `astro preview`; serve the static export.
    command:
      'pnpm exec astro build && npx --yes serve .vercel/output/static -l 4321 --no-port-switching',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...process.env,
      VITEST: '',
      PUBLIC_SITE_URL: baseURL,
      PUBLIC_BOOKING_OPEN: 'true',
    },
  },
});
