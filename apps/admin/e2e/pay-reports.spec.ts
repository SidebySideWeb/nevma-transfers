import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(today|bookings)/);
}

async function axeCheck(page: Page) {
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `axe @ ${width}`).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe.configure({ mode: 'serial' });

let driverId = '';

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-pay.sql')}"`,
    { stdio: 'inherit' },
  );
  driverId = execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -c "select id from public.drivers where email = 'e2e-pay@tem.local'"`,
    { encoding: 'utf8' },
  ).trim();
  if (!driverId) throw new Error('seed-pay: missing driver');
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'pay suite runs once on desktop');
});

test('DR-08 statement build, recalculate, approve, paid; DR-09 reports + exports', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);

  await page.goto(`/drivers/${driverId}`);
  await expect(page.getByRole('heading', { name: 'E2E Pay Driver' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay plan' })).toBeVisible();
  await axeCheck(page);

  // Build custom statement for October 2026 (seed data).
  await page.getByRole('button', { name: 'New statement' }).click();
  const stDlg = page.getByRole('dialog', { name: /New statement/ });
  await expect(stDlg).toBeVisible();
  await stDlg.locator('label[for="st-c"]').click();
  await stDlg.locator('#st-from').fill('2026-10-01');
  await stDlg.locator('#st-to').fill('2026-10-31');
  await stDlg.getByRole('button', { name: 'Build statement' }).click();
  await expect(page).toHaveURL(new RegExp(`/drivers/${driverId}/statements/[0-9a-f-]{36}`), {
    timeout: 30_000,
  });
  const statementUrl = page.url();
  await expect(page.getByText('Draft')).toBeVisible();
  await expect(page.getByRole('table')).toContainText(/Salary|Hours|Transfer|Percent/i);

  // Add adjustment then recalculate.
  await page.goto(`/drivers/${driverId}`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const adj = page.getByRole('dialog', { name: /Add an adjustment/ });
  await expect(adj).toBeVisible();
  await adj.locator('#aj-d').fill('2026-10-20');
  await adj.locator('#aj-a').fill('10.00');
  await adj.locator('#aj-n').fill('e2e tip');
  await adj.getByRole('button', { name: 'Add adjustment' }).click();
  await expect(page.getByText('Adjustment added')).toBeVisible({ timeout: 15_000 });

  await page.goto(statementUrl);
  await page.getByRole('button', { name: 'Recalculate' }).first().click();
  await expect(page.getByRole('table')).toContainText(/e2e tip|Tip/i, { timeout: 15_000 });

  // Approve
  await page.getByRole('button', { name: /Approve/ }).click();
  const appr = page.getByRole('dialog', { name: /Approve this statement/ });
  await expect(appr).toBeVisible();
  await appr.getByRole('button', { name: /Approve/ }).click();
  await expect(page.getByText('Approved')).toBeVisible({ timeout: 15_000 });

  // Recalculate refused
  await page.getByTestId('recalc-locked').click();
  await expect(page.getByRole('alert')).toContainText(/cannot be recalculated|approved/i, {
    timeout: 15_000,
  });

  // Mark paid
  await page.getByRole('button', { name: /Mark paid/ }).click();
  const paid = page.getByRole('dialog', { name: /Mark as paid/ });
  await paid.locator('#pd-r').fill('BANK-E2E-PAY-01');
  await paid.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.locator('.badge', { hasText: 'Paid' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('BANK-E2E-PAY-01')).toBeVisible();
  await axeCheck(page);

  // DR-09 reports periods + exports
  for (const period of ['week', 'month', 'quarter'] as const) {
    await page.goto(`/reports?period=${period}&tab=pay`);
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  }
  await page.goto('/reports?period=custom&from=2026-10-01&to=2026-10-31&tab=pay');
  await expect(page.getByRole('table')).toContainText('E2E Pay Driver');
  await axeCheck(page);

  const csv = await page.request.get(
    '/reports/export.csv?period=custom&from=2026-10-01&to=2026-10-31&tab=pay',
  );
  expect(csv.ok()).toBeTruthy();
  const csvBody = await csv.text();
  expect(csvBody.charCodeAt(0)).toBe(0xfeff);
  expect(csvBody).toContain('E2E Pay Driver');
  expect(csv.headers()['content-disposition']).toMatch(/driver-pay_2026-10-01_2026-10-31\.csv/);

  const xlsx = await page.request.get(
    '/reports/export.xlsx?period=custom&from=2026-10-01&to=2026-10-31&tab=pay',
  );
  expect(xlsx.ok()).toBeTruthy();
  const buf = Buffer.from(await xlsx.body());
  expect(buf.byteLength).toBeGreaterThan(1000);
  expect(xlsx.headers()['content-disposition']).toMatch(/driver-pay_2026-10-01_2026-10-31\.xlsx/);

  await page.goto('/reports?period=custom&from=2026-10-01&to=2026-10-31&tab=vehicles');
  await expect(page.getByRole('table')).toBeVisible();
  await page.goto('/reports?period=custom&from=2026-10-01&to=2026-10-31&tab=bookings');
  await expect(page.getByRole('table')).toBeVisible();
});
