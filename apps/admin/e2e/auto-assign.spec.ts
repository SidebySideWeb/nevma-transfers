import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = '2027-03-15';

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

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-auto-assign.sql')}"`,
    { stdio: 'inherit' },
  );
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'auto-assign runs once on desktop');
});

test('one-vehicle class: office booking shows Auto; change clears it', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto(`/bookings/new?date=${DAY}`);
  await page.locator('#nb-date').fill(DAY);
  await page.locator('#nb-time').fill('11:00');
  await page.locator('#nb-name').fill('Auto Solo');
  await page.locator('#nb-mail').fill('e2e-auto-solo@example.com');
  await page.locator('#nb-tel').fill('+306900000011');
  await setNativeSelect(page, 'nb-from', 'demo-airport');
  await setNativeSelect(page, 'nb-to', 'demo-centre');
  await page.locator('#nb-pa').fill('Arrivals');
  await page.locator('#nb-da').fill('Hotel');
  await expect(page.locator('#nb-cls option[value="e2e-solo"]')).toHaveAttribute(
    'data-meta',
    /\d+ free/,
    { timeout: 20_000 },
  );
  await setNativeSelect(page, 'nb-cls', 'e2e-solo');
  await expect(page.locator('#nb-veh-auto')).toBeVisible();
  await expect(page.locator('#nb-veh-auto')).toContainText(/assigned automatically/i);
  await page.getByRole('radio', { name: /Paid offline/ }).check();
  await page.locator('#nb-submit').click();
  await expect(page).toHaveURL(/\/bookings\/ELP-/, { timeout: 30_000 });
  await expect(page.getByLabel('Assigned automatically: the only active vehicle in this class')).toBeVisible();
  await expect(page.locator('.badge.plain', { hasText: 'Auto' })).toBeVisible();
  await expect(page.locator('.badge', { hasText: /confirmed/i }).first()).toBeVisible();

  // Clear assignment — DB clears vehicle_auto_assigned.
  await setNativeSelect(page, 'veh', '');
  await page.getByRole('button', { name: 'Assign vehicle' }).click();
  await expect(page.locator('.badge.plain', { hasText: 'Auto' })).toHaveCount(0);
  await axeCheck(page);
});

test('two-vehicle class stays unassigned; switch off skips auto-assign; Assign now works', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto(`/bookings/new?date=${DAY}`);
  await page.locator('#nb-date').fill(DAY);
  await page.locator('#nb-time').fill('14:00');
  await page.locator('#nb-name').fill('Auto Duo');
  await page.locator('#nb-mail').fill('e2e-auto-duo@example.com');
  await page.locator('#nb-tel').fill('+306900000012');
  await setNativeSelect(page, 'nb-from', 'demo-airport');
  await setNativeSelect(page, 'nb-to', 'demo-centre');
  await page.locator('#nb-pa').fill('Arrivals');
  await page.locator('#nb-da').fill('Hotel');
  await expect(page.locator('#nb-cls option[value="demo-e-class"]')).toHaveAttribute(
    'data-meta',
    /\d+ free/,
    { timeout: 20_000 },
  );
  await setNativeSelect(page, 'nb-cls', 'demo-e-class');
  await expect(page.locator('#nb-veh-auto')).toBeHidden();
  await page.getByRole('radio', { name: /Paid offline/ }).check();
  await page.locator('#nb-submit').click();
  await expect(page).toHaveURL(/\/bookings\/ELP-/, { timeout: 30_000 });
  await expect(page.locator('.badge.plain', { hasText: 'Auto' })).toHaveCount(0);
  await expect(page.locator('#veh')).toHaveValue('');

  await page.goto('/settings');
  const sw = page.locator('[data-auto-assign-switch]');
  await expect(sw).toBeVisible();
  if (await sw.isChecked()) {
    await sw.uncheck();
    await page.locator('[data-auto-assign-form] button[type="submit"]').click();
    await expect(page.locator('[data-auto-assign-switch]')).not.toBeChecked({ timeout: 15_000 });
  }
  await axeCheck(page);

  await page.goto(`/bookings/new?date=${DAY}`);
  await page.locator('#nb-date').fill(DAY);
  await page.locator('#nb-time').fill('16:00');
  await page.locator('#nb-name').fill('Auto Off');
  await page.locator('#nb-mail').fill('e2e-auto-off@example.com');
  await page.locator('#nb-tel').fill('+306900000013');
  await setNativeSelect(page, 'nb-from', 'demo-airport');
  await setNativeSelect(page, 'nb-to', 'demo-centre');
  await page.locator('#nb-pa').fill('Arrivals');
  await page.locator('#nb-da').fill('Hotel');
  await setNativeSelect(page, 'nb-cls', 'e2e-solo');
  await page.getByRole('radio', { name: /Paid offline/ }).check();
  await page.locator('#nb-submit').click();
  await expect(page).toHaveURL(/\/bookings\/ELP-/, { timeout: 30_000 });
  await expect(page.locator('#veh')).toHaveValue('');
  await expect(page.locator('.badge.plain', { hasText: 'Auto' })).toHaveCount(0);

  // Turn switch back on and use Assign now on the class page.
  await page.goto('/settings');
  const sw2 = page.locator('[data-auto-assign-switch]');
  if (!(await sw2.isChecked())) {
    await sw2.check();
    await page.locator('[data-auto-assign-form] button[type="submit"]').click();
  }
  await page.goto('/fleet/e2e-solo');
  const assignNow = page.getByRole('button', { name: 'Assign now' });
  await expect(assignNow).toBeVisible({ timeout: 15_000 });
  await assignNow.click();
  await expect(page.getByText(/booking.*assigned to E2E-SOLO-1/i)).toBeVisible({ timeout: 15_000 });
  await axeCheck(page);
});
