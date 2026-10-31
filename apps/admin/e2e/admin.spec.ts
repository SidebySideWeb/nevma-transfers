import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const VISITOR_EMAIL = 'visitor@tem.local';
const VISITOR_PASS = 'VisitorPass123!';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-admin.sql')}"`,
    { stdio: 'inherit' },
  );
});

test('AC-18 non-staff user is signed out to login', async ({ page }) => {
  await login(page, VISITOR_EMAIL, VISITOR_PASS);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('alert')).toContainText(/Sign in failed/i);
});

test('AC-18 staff sees bookings and VIP filter', async ({ page }) => {
  await login(page, STAFF_EMAIL, STAFF_PASS);
  await expect(page).toHaveURL(/\/bookings/);
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'TEM-ADAAAA' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText(/DEMO/i);

  await page.getByLabel(/VIP security only/i).check();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('link', { name: 'TEM-ADAAAA' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'TEM-ADAAAB' })).toHaveCount(0);
});

test('AC-18 assign vehicle; overlap shows clear error; invoice; refund; cancel', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, STAFF_EMAIL, STAFF_PASS);

  await page.goto('/bookings/TEM-ADAAAA');
  await expect(page.getByRole('heading', { name: 'TEM-ADAAAA' })).toBeVisible();

  const vehicleSelect = page.locator('#veh');
  const options = vehicleSelect.locator('option:not([value=""])');
  const count = await options.count();
  expect(count).toBeGreaterThan(0);
  const vehicleValue = await options.first().getAttribute('value');
  await vehicleSelect.selectOption(vehicleValue!);
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.locator('.badge').filter({ hasText: 'assigned' })).toBeVisible({
    timeout: 15_000,
  });

  await page.goto('/bookings/TEM-ADAAAB');
  await page.locator('#veh').selectOption(vehicleValue!);
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('alert')).toContainText(/overlap|not available|exclusion/i, {
    timeout: 15_000,
  });

  await page.goto('/bookings/TEM-ADAAAA');
  await page.locator('#ist').selectOption('issued');
  await page.locator('#inr').fill('INV-1001');
  await page.getByRole('button', { name: /Save notes and invoice/i }).click();
  await expect(page.locator('#inr')).toHaveValue('INV-1001', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Refund…' }).click({ force: true });
  await page.locator('#amt').fill('10');
  await page.getByRole('button', { name: 'Confirm refund' }).click({ force: true });
  await expect(page.locator('td', { hasText: 'refund' }).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('td', { hasText: '€ 10.00' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Cancel booking…' }).click({ force: true });
  await page.locator('#rf').selectOption('none');
  await page.getByRole('button', { name: 'Confirm cancel' }).click({ force: true });
  await expect(page.locator('.badge').filter({ hasText: 'cancelled' })).toBeVisible({
    timeout: 90_000,
  });
});



test('AC-10 forged price_cents update is rejected', async ({ page, request }) => {
  await login(page, STAFF_EMAIL, STAFF_PASS);
  // Hit the deliberate forge action via the Astro actions endpoint after obtaining cookies.
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await request.post('/_actions/forgePriceCents', {
    headers: {
      cookie: cookieHeader,
      'content-type': 'application/json',
    },
    data: { reference: 'TEM-ADAAAB', priceCents: 1 },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('AC-19 axe on admin pages; tables keyboard-reachable', async ({ page }) => {
  await login(page, STAFF_EMAIL, STAFF_PASS);
  const routes = [
    '/bookings',
    '/bookings/TEM-ADAAAB',
    '/blocked-slots',
    '/prices',
    '/hourly-rates',
    '/extras',
    '/fleet',
    '/zones',
    '/settings',
  ];
  for (const route of routes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, `${route}: ${JSON.stringify(serious)}`).toEqual([]);
  }

  await page.goto('/bookings');
  const wrap = page.getByRole('region', { name: 'Scrollable table' }).first();
  await wrap.focus();
  await expect(wrap).toBeFocused();
});
