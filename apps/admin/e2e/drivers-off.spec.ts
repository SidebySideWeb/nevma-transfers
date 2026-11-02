/**
 * DR-01: with FEATURE_DRIVERS=false the drivers nav and pages are gone (404).
 * Run with FEATURE_DRIVERS=false on the webServer (see playwright project env override below).
 */
import { expect, test, type Page } from '@playwright/test';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(today|bookings)/);
}

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'DR-01 off suite once on desktop');
  // Opt-in: start admin with FEATURE_DRIVERS=false and set QA_DRIVERS_OFF=1 (no reuse of a drivers-on server).
  test.skip(process.env.QA_DRIVERS_OFF !== '1', 'set QA_DRIVERS_OFF=1 with FEATURE_DRIVERS=false');
});

test('DR-01 off: no Drivers/Today/Reports nav; /drivers /today /reports /api/driver 404', async ({
  page,
  request,
}) => {
  await login(page);
  // With drivers off, landing is /bookings (never /today).
  await expect(page).toHaveURL(/\/bookings/);
  const nav = page.getByRole('navigation', { name: 'Admin' });
  await expect(nav.getByRole('link', { name: 'Drivers' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Today' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Reports' })).toHaveCount(0);

  for (const path of ['/drivers', '/today', '/reports']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }

  const api = await request.get('/api/driver/v1/me');
  expect(api.status()).toBe(404);
});
