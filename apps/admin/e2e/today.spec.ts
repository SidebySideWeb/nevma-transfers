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

async function setNativeSelect(page: Page, id: string, value: string) {
  await page.locator(`#${id}`).evaluate((el, v) => {
    const sel = el as HTMLSelectElement;
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
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

let reference = '';

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-today.sql')}"`,
    { stdio: 'inherit' },
  );
  reference = execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -c "select reference from public.bookings where customer_email = 'e2e-today@example.com' order by created_at desc limit 1"`,
    { encoding: 'utf8' },
  ).trim();
  if (!reference) throw new Error('seed-today: missing booking reference');
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'today suite runs once on desktop');
});

test('DR-06 Today board; DR-05 office trip completed; drivers calendar; axe', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.locator('#fleet-now-body')).toContainText('DEMO E-CLASS-1');
  await expect(page.locator('#drivers-now-body')).toContainText('E2E Today Driver');
  await axeCheck(page);

  // Advance trip status → Today partial reflects it after refresh.
  await page.goto(`/bookings/${reference}`);
  await expect(page.getByRole('form', { name: 'Trip status' })).toBeVisible();
  await setNativeSelect(page, 'trip-st', 'on_way');
  await page.getByRole('button', { name: 'Update trip status' }).click();
  await expect(page.locator('#trip-err')).toHaveCount(0);
  await expect(page.locator('.timeline')).toContainText(/On the way/, { timeout: 15_000 });

  await page.goto('/today');
  await expect(page.locator('#fleet-now-body')).toContainText(/On the way/, { timeout: 15_000 });
  await page.goto('/today?partial=1');
  await expect(page.locator('#fleet-now-body')).toContainText('On the way');

  // DR-05: office sets completed → booking completed.
  await page.goto(`/bookings/${reference}`);
  await setNativeSelect(page, 'trip-st', 'completed');
  await page.getByRole('button', { name: 'Update trip status' }).click();
  await expect(page.locator('.badge', { hasText: /completed/i }).first()).toBeVisible({
    timeout: 15_000,
  });

  // Drivers calendar switch.
  await page.goto('/calendar?view=drivers');
  const boardNav = page.getByRole('navigation', { name: 'Board' });
  await expect(boardNav).toBeVisible();
  await expect(boardNav.getByRole('link', { name: 'Drivers' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: /Drivers calendar/ })).toContainText('E2E Today Driver');
  await axeCheck(page);
});
