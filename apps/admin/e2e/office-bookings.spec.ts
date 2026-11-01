import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const DAY = '2026-12-20';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/bookings/);
}

/** Set a brand-dropdown native <select> (aria-hidden) and fire change. */
async function setNativeSelect(page: Page, id: string, value: string) {
  await page.locator(`#${id}`).evaluate((el, v) => {
    const sel = el as HTMLSelectElement;
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Fill the New booking form for an airport -> centre transfer in the sedan class. */
async function fillBooking(
  page: Page,
  o: { name: string; payment: 'link' | 'offline_paid' | 'offline_collect'; at?: string; note: string },
) {
  if (o.at) {
    await page.locator('#nb-date').fill(o.at.slice(0, 10));
    await page.locator('#nb-time').fill(o.at.slice(11, 16));
  }
  await page.locator('#nb-name').fill(o.name);
  await page.locator('#nb-mail').fill(`e2e-office-${o.name.toLowerCase().replace(/\W+/g, '-')}@example.com`);
  await page.locator('#nb-tel').fill('+306900000099');
  await setNativeSelect(page, 'nb-from', 'demo-airport');
  await setNativeSelect(page, 'nb-to', 'demo-centre');
  await page.locator('#nb-pa').fill('Arrivals, meeting point 3');
  await page.locator('#nb-da').fill('Hotel, Syntagma');
  await page.locator('#nb-notes').fill(o.note);
  const sedan = page.locator('#nb-cls option[value="demo-sedan"]');
  await expect(sedan).toHaveAttribute('data-meta', /\d+ free · € /, { timeout: 20_000 });
  await setNativeSelect(page, 'nb-cls', 'demo-sedan');
  const pay = {
    link: /Send a Viva payment link/,
    offline_paid: /Paid offline/,
    offline_collect: /To collect offline/,
  }[o.payment];
  await page.getByRole('radio', { name: pay }).check();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-office.sql')}"`,
    { stdio: 'inherit' },
  );
});

// Playwright needs the destructured first argument to detect fixtures.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'office flows run once, on the desktop project');
});

test('office booking paid offline from the calendar empty-time popover', async ({ page }) => {
  await login(page);
  await page.goto(`/calendar?date=${DAY}&class=demo-sedan`);
  await expect(page.getByRole('region', { name: /Fleet calendar/ })).toBeVisible();

  // 10:00 on the first sedan: 10 hours x 56 px from the left edge of the track.
  const empty = page.getByRole('link', { name: /New booking or block on DEMO SEDAN-1/ });
  await empty.click({ position: { x: 10 * 56 + 5, y: 10 } });
  const pop = page.getByRole('dialog', { name: /Empty time on DEMO SEDAN-1/ });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('DEMO SEDAN-1 · 10:00');
  await expect(pop.getByRole('link', { name: 'Block' })).toHaveAttribute('href', /blocked-slots\?vehicle=.*&from=2026-12-20T10:00/);
  await pop.getByRole('link', { name: 'New booking' }).click();

  await expect(page).toHaveURL(/\/bookings\/new\?vehicle=.*&at=2026-12-20T10:00/);
  await expect(page.locator('#nb-date')).toHaveValue(DAY);
  await expect(page.locator('#nb-time')).toHaveValue('10:00');
  await fillBooking(page, { name: 'E2E Calendar', payment: 'offline_paid', note: 'e2e-office from calendar' });
  // The vehicle from the calendar stays selected once its class is free.
  await expect(page.locator('#nb-veh')).not.toHaveValue('', { timeout: 20_000 });
  await expect(page.locator('#nb-submit')).toHaveText('Create booking, paid offline');
  await page.locator('#nb-submit').click();

  await expect(page).toHaveURL(/\/bookings\/(TEM-[A-Z0-9]+)\?toast=created/, { timeout: 60_000 });
  const reference = /\/bookings\/(TEM-[A-Z0-9]+)/.exec(page.url())![1]!;
  await expect(page.getByRole('status')).toContainText(`Booking ${reference} created`);
  await expect(page.locator('.badge').filter({ hasText: 'Office' }).first()).toBeVisible();
  await expect(page.locator('#added-by')).toContainText(`Added by ${STAFF_EMAIL} · Cash`);
  await expect(page.locator('.badge').filter({ hasText: 'assigned' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record offline payment…' })).toHaveCount(0);

  await page.goto('/bookings?source=office');
  const row = page.locator('tr', { has: page.getByRole('link', { name: reference }) });
  await expect(row.locator('.badge', { hasText: 'Office' })).toBeVisible();
  await page.goto('/bookings?source=online');
  await expect(page.getByRole('link', { name: reference })).toHaveCount(0);

  await page.goto(`/calendar?date=${DAY}&class=demo-sedan`);
  await expect(page.getByRole('link', { name: new RegExp(`^${reference} 10:00`) })).toBeVisible();
});

test('office booking with a payment link is pending and held', async ({ page }) => {
  await login(page);
  await page.goto('/bookings/new');
  await fillBooking(page, {
    name: 'E2E Link',
    payment: 'link',
    at: `${DAY}T14:00`,
    note: 'e2e-office payment link',
  });
  await expect(page.locator('#nb-submit')).toHaveText('Create and send payment link');
  await page.locator('#nb-submit').click();
  await expect(page).toHaveURL(/\/bookings\/(TEM-[A-Z0-9]+)\?toast=created/, { timeout: 60_000 });
  await expect(page.locator('.badge').filter({ hasText: 'pending' })).toBeVisible();
  await expect(page.locator('.badge').filter({ hasText: 'Office' }).first()).toBeVisible();
  await expect(page.locator('#added-by')).toContainText('Viva');
  await expect(page.getByRole('button', { name: 'Record offline payment…' })).toHaveCount(0);
});

test('record an offline payment on a to-collect booking', async ({ page }) => {
  await login(page);
  await page.goto('/bookings/new');
  await fillBooking(page, {
    name: 'E2E Collect',
    payment: 'offline_collect',
    at: `${DAY}T17:00`,
    note: 'e2e-office to collect',
  });
  await page.locator('#nb-submit').click();
  await expect(page).toHaveURL(/\/bookings\/(TEM-[A-Z0-9]+)\?toast=created/, { timeout: 60_000 });
  await expect(page.locator('#payment-status')).toHaveText('unpaid');

  await page.getByRole('button', { name: 'Record offline payment…' }).click();
  const dialog = page.locator('#offline-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('No money moves through Viva');
  await dialog.locator('#on').fill('Paid to driver, receipt 0412');
  await dialog.getByRole('button', { name: /^Record € / }).click();

  await expect(page.getByRole('button', { name: 'Record offline payment…' })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#payment-status')).toHaveText('paid');
  await expect(page.locator('td', { hasText: 'Cash' }).first()).toBeVisible();
  await expect(page.locator('td', { hasText: 'succeeded' }).first()).toBeVisible();
});

test('a class with no free vehicle shows 0 free, is disabled, and the calendar strip shows 0', async ({ page }) => {
  await login(page);
  await page.goto('/bookings/new?at=2026-12-22T10:30');
  await setNativeSelect(page, 'nb-from', 'demo-airport');
  await setNativeSelect(page, 'nb-to', 'demo-centre');
  const sedan = page.locator('#nb-cls option[value="demo-sedan"]');
  await expect(sedan).toHaveAttribute('data-meta', '0 free', { timeout: 20_000 });
  await expect(sedan).toBeDisabled();

  await page.goto('/calendar?date=2026-12-22&class=demo-sedan');
  await expect(page.locator('.cal-free span[title="10:00 · 0 free"]')).toHaveClass(/full/);
  await expect(page.locator('.bar.block').first()).toBeVisible();
});

test('validation errors stay next to the fields', async ({ page }) => {
  await login(page);
  await page.goto('/bookings/new');
  await page.locator('#nb-submit').click();
  await expect(page.locator('#nb-name-err')).toBeVisible();
  await expect(page.locator('#nb-mail-err')).toBeVisible();
  await expect(page.locator('#nb-cls-err')).toBeVisible();
  await expect(page.locator('#nb-name')).toBeFocused();
  await page.locator('#nb-ovr').check();
  await page.locator('#nb-submit').click();
  await expect(page.locator('#nb-why-err')).toContainText(/reason is required/i);
});

test('customer lookup finds a previous customer and fills the form', async ({ page }) => {
  await login(page);
  await page.goto('/bookings/new');
  await page.locator('#nb-find').fill('E2E Calendar');
  const option = page.locator('#nb-find-list [role="option"]:not(.new)', { hasText: 'E2E Calendar' });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await page.locator('#nb-find').press('ArrowDown');
  await page.locator('#nb-find').press('Enter');
  await expect(page.locator('#nb-name')).toHaveValue('E2E Calendar');
  await expect(page.locator('#nb-mail')).toHaveValue(/e2e-office-e2e-calendar@example\.com/);
});

test('class dropdown is operable by keyboard only', async ({ page }) => {
  await login(page);
  await page.goto('/bookings/new');
  const combo = page
    .locator('#nb-from')
    .locator('xpath=ancestor::div[contains(@class,"ep-select")]')
    .locator('.ep-select-btn');
  await combo.focus();
  await page.keyboard.press('ArrowDown');
  await expect(combo).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(combo).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#nb-from')).not.toHaveValue('');
  // Tab reaches the next control without a mouse.
  await page.keyboard.press('Tab');
  await expect(page.locator('#nb-to').locator('xpath=ancestor::div[contains(@class,"ep-select")]').locator('.ep-select-btn')).toBeFocused();
});

test('axe on New booking and the fleet calendar at 390, 1024 and 1440', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  const routes = [
    '/bookings/new',
    `/calendar?date=${DAY}`,
    `/calendar?view=week&date=${DAY}`,
    '/calendar?date=2026-10-25',
  ];
  for (const route of routes) {
    for (const width of [390, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, `${route}@${width}: ${JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `${route}@${width} horizontal overflow`).toBe(false);
    }
  }
});

test('25 Oct 2026 shows 25 hour columns; 29 Mar 2026 shows 23', async ({ page }) => {
  await login(page);
  await page.goto('/calendar?date=2026-10-25');
  await expect(page.locator('.cal-hours span')).toHaveCount(25);
  await page.goto('/calendar?date=2026-03-29');
  await expect(page.locator('.cal-hours span')).toHaveCount(23);
});
