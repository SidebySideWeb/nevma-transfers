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

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-fleet-setup.sql')}"`,
    { stdio: 'inherit' },
  );
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'fleet setup runs once on desktop');
});

test('add limo class, vehicle, hourly rate; checklist only Sanity missing', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto('/fleet');
  await page.getByRole('button', { name: 'Add class' }).click();
  const addClass = page.locator('#add-class');
  await expect(addClass).toBeVisible();
  await addClass.locator('#ac-name').fill('Limousine');
  await addClass.locator('#ac-key').fill('limo');
  await addClass.locator('#ac-pax').fill('3');
  await addClass.locator('#ac-lug').fill('2');
  await addClass.locator('#ac-buf').fill('60');
  await addClass.getByRole('button', { name: 'Add class' }).click();

  await expect(page.getByRole('cell', { name: 'limo', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: /Edit Limousine/i }).click();
  await expect(page).toHaveURL(/\/fleet\/limo/);
  await expect(page.getByRole('heading', { name: 'Limousine' })).toBeVisible();

  await page.getByRole('button', { name: 'Add vehicle' }).click();
  const addVeh = page.locator('#add-vehicle');
  await addVeh.locator('#av-lab').fill('LIMO-1');
  await addVeh.locator('#av-mod').fill('Mercedes · black');
  await addVeh.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByRole('cell', { name: 'LIMO-1', exact: true })).toBeVisible({ timeout: 15_000 });

  await page.goto('/hourly-rates');
  await expect(page.getByLabel('limo rate')).toBeVisible();
  await page.getByLabel('limo rate').fill('120.00');
  await page.getByLabel('limo min hours').fill('3');
  await page.getByLabel('limo max hours').fill('12');
  await page.getByRole('button', { name: 'Save hourly rates' }).click();
  await expect(page.getByLabel('limo rate')).toHaveValue('120.00', { timeout: 15_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.goto('/fleet/limo');
  await expect(page.getByText(/€ 120\.00 per hour/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-ready="vehicle"]')).toHaveClass(/done/);
  await expect(page.locator('[data-ready="price"]')).toHaveClass(/done/);
  await expect(page.locator('[data-ready="sanity"]')).not.toHaveClass(/done/);
  await expect(page.locator('[data-ready="online"]')).not.toHaveClass(/done/);
});

test('retire vehicle with future booking shows message and stays active', async ({ page }) => {
  await login(page);
  await page.goto('/fleet');
  await page.getByRole('button', { name: 'FLEET-RETIRE' }).click();
  const dlg = page.locator('#edit-vehicle');
  await expect(dlg).toBeVisible();
  await setNativeSelect(page, 'ev-st', 'retired');
  await dlg.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(page.getByRole('alert').first()).toContainText(/future booking/i, { timeout: 15_000 });

  // Still listed as Active after failed retire.
  const row = page.locator('tr').filter({ hasText: 'FLEET-RETIRE' });
  await expect(row.locator('.badge').filter({ hasText: /Active/i })).toBeVisible();
});

test('rename unused zone code; delete never-used extra', async ({ page }) => {
  await login(page);

  await page.goto('/zones');
  await page.getByRole('button', { name: 'Add zone' }).click();
  const addZone = page.locator('#add-zone');
  await addZone.locator('#az-name').fill('E2E South');
  await addZone.locator('#az-code').fill('e2e-south');
  await addZone.getByRole('button', { name: 'Add zone' }).click();
  await expect(page.locator('input[value="e2e-south"]')).toBeVisible({ timeout: 15_000 });

  const codeInput = page.locator('input[name="code"][value="e2e-south"]');
  await codeInput.fill('e2e-south-renamed');
  await codeInput.locator('xpath=ancestor::form').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('input[value="e2e-south-renamed"]')).toBeVisible({ timeout: 15_000 });

  await page.goto('/extras');
  await page.getByRole('button', { name: 'Add extra' }).click();
  const addExtra = page.locator('#add-extra');
  await addExtra.locator('#ax-name').fill('E2E towel');
  await addExtra.locator('#ax-code').fill('e2e-towel');
  await addExtra.locator('#ax-pr').fill('5.00');
  await addExtra.getByRole('button', { name: 'Add extra' }).click();
  await expect(page.getByText('e2e-towel')).toBeVisible({ timeout: 15_000 });

  const extraRow = page.locator('tr').filter({ hasText: 'e2e-towel' });
  await extraRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('e2e-towel')).toHaveCount(0, { timeout: 15_000 });

  await expect(page.locator('tr').filter({ hasText: 'vip-security' })).toContainText(/Built in/i);
});

test('axe on fleet, class, zones, extras at 390 / 1024 / 1440', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const urls = ['/fleet', '/fleet/demo-e-class', '/zones', '/extras'];
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of urls) {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['critical', 'serious'].includes(v.impact ?? ''),
      );
      expect(serious, `${url} @ ${width}px`).toEqual([]);
    }
  }
});
