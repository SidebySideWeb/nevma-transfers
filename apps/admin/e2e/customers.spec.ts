import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const PHONE = '+306911112222';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/bookings/);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-customers.sql')}"`,
    { stdio: 'inherit' },
  );
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'customers flows run once on desktop');
});

test('search finds a customer by phone; edit notes and phone; past booking unchanged', async ({
  page,
}) => {
  await login(page);
  await page.goto('/customers');
  await page.getByLabel('Search').fill(PHONE);
  await expect(page.getByRole('link', { name: 'E2E Customer' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'E2E Customer' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+/i);

  const bookingPhoneBefore = await page
    .locator('tr')
    .filter({ hasText: 'EP-E2ECUS' })
    .count();
  expect(bookingPhoneBefore).toBe(1);

  await page.getByLabel('Phone').fill('+306933334444');
  await page.getByLabel(/Notes for the office/).fill('Prefers quiet driver — e2e');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('status')).toContainText(/Customer saved/i, { timeout: 15_000 });
  await expect(page.getByLabel('Phone')).toHaveValue('+306933334444');
  await expect(page.getByLabel(/Notes for the office/)).toHaveValue(/Prefers quiet driver/);

  // Past booking row still present (snapshot at booking time is unchanged in bookings table).
  await expect(page.getByRole('link', { name: 'EP-E2ECUS' })).toBeVisible();
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    try {
      const out = execSync(
        `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select customer_phone from bookings where reference = 'EP-E2ECUS'"`,
        { encoding: 'utf8' },
      );
      resolve({ stdout: out });
    } catch (e) {
      reject(e);
    }
  });
  expect(stdout.trim()).toBe('+306911112222');
});

test('New booking for … prefills the customer', async ({ page }) => {
  await login(page);
  await page.goto('/customers?q=E2E+Customer');
  await page.getByRole('link', { name: 'E2E Customer' }).click();
  await page.getByRole('link', { name: /New booking for E2E/i }).click();
  await expect(page).toHaveURL(/\/bookings\/new\?customer=/);
  await expect(page.locator('#nb-name')).toHaveValue('E2E Customer', { timeout: 15_000 });
  await expect(page.locator('#nb-mail')).toHaveValue('e2e-customer@example.com');
  await expect(page.locator('#nb-tel')).toHaveValue('+306933334444');
});

test('axe on customers list and detail at 390 / 1024 / 1440', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto('/customers?q=E2E');
  await page.getByRole('link', { name: 'E2E Customer' }).click();
  const detailUrl = page.url();
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ['/customers', detailUrl]) {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['critical', 'serious'].includes(v.impact ?? ''),
      );
      expect(serious, `${url} @ ${width}px`).toEqual([]);
    }
  }
});
