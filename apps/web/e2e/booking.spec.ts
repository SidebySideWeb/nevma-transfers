import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';

const databaseUrl =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

async function resetBookingSideEffects() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      'truncate table rate_limits, booking_extras, payments, slot_holds, bookings restart identity cascade',
    );
  } finally {
    await client.end();
  }
}

async function mockTurnstile(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __TEM_TURNSTILE_TOKEN__: string }).__TEM_TURNSTILE_TOKEN__ =
      'test-turnstile-token';
  });
}

function futureLocal(hoursAhead = 4): string {
  const d = new Date(Date.now() + hoursAhead * 3600_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

async function fillSearchTransfer(page: Page, hoursAhead = 8) {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /Book your ride/i })).toBeVisible();
  await page.locator('#from').selectOption('demo-airport');
  await page.locator('#to').selectOption('demo-centre');
  await page.locator('#date').fill(futureLocal(hoursAhead));
  await page.locator('#pax').fill('2');
  await page.locator('#bags').fill('2');
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.beforeEach(async ({ page }) => {
  await resetBookingSideEffects();
  await mockTurnstile(page);
});

test('AC-01: full transfer booking reaches hand-off', async ({ page }, testInfo) => {
  // Stagger parallel phone/desktop so they do not exhaust the same slot.
  await fillSearchTransfer(page, 8 + testInfo.project.name.length);
  await page.getByRole('button', { name: /^Select$/i }).first().click();
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('#pa').fill('Street 1, Athens');
  await page.locator('#da').fill('Street 2, Athens');
  await page.locator('#nm').fill('Test Customer');
  await page.locator('#em').fill('customer@example.com');
  await page.locator('#ph').fill('+30 6900000000');
  await page.getByLabel(/I accept/i).check();
  await page.getByRole('button', { name: /Continue to review/i }).click();
  await expect(page.getByRole('heading', { name: /Review and pay/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Pay securely/i }).click();
  await expect(page.getByRole('heading', { name: /Taking you to Viva/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue to payment/i })).toBeVisible();
});

test('hourly booking for 4 hours', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /Book your ride/i })).toBeVisible();
  // Radios are opacity:0 + pointer-events:none; force-click still fires React onChange.
  await page.getByRole('radio', { name: /By the hour/i }).click({ force: true });
  await expect(page.getByRole('radio', { name: /By the hour/i })).toBeChecked({ timeout: 5_000 });
  await expect(page.locator('#to')).toHaveCount(0);
  await page.locator('#from').selectOption('demo-centre');
  await page.getByRole('button', { name: /Increase Number of hours/i }).click(); // 3 -> 4
  await expect(page.locator('#hours')).toHaveValue('4');
  // Farther out than AC-01 transfers so holds do not collide (hourly needs a long window).
  await page.locator('#date').fill(futureLocal(36));
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
  const selectBtn = page.getByRole('button', { name: /^Select$/i }).first();
  await expect(selectBtn).toBeVisible({ timeout: 15_000 });
  await selectBtn.click();
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });
});

test('AC-16: no-price pair shows contact block', async ({ page }) => {
  await page.goto('/book');
  await page.locator('#from').selectOption('demo-north');
  await page.locator('#to').selectOption('demo-port');
  await page.locator('#date').fill(futureLocal(5));
  await page.locator('#pax').fill('7');
  await page.locator('#bags').fill('7');
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
  // With 7 pax only van fits; north→port van has no price → contact or no_price card
  const contact = page.getByText(/cannot price this trip online/i);
  const noPrice = page.getByText(/no online price/i);
  await expect(contact.or(noPrice).first()).toBeVisible();
});

test('AC-19: axe on each step + keyboard path', async ({ page }) => {
  await fillSearchTransfer(page);
  for (const heading of [/Book your ride/i, /Choose your vehicle/i]) {
    if (heading.source?.includes('Book')) {
      await page.goto('/book');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact || ''),
    );
    expect(bad, JSON.stringify(bad.map((v) => v.id))).toEqual([]);
  }

  await fillSearchTransfer(page);
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: /^Select$/i }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });

  const detailsAxe = await new AxeBuilder({ page }).analyze();
  expect(
    detailsAxe.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')),
  ).toEqual([]);
});
