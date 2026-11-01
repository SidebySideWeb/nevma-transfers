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

function futureLocal(hoursAhead = 8): string {
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

function parseEuro(text: string): number {
  const m = text.replace(/\s/g, '').match(/€?\s*([\d.,]+)/);
  if (!m) return NaN;
  return Math.round(Number(m[1].replace(',', '')) * 100);
}

test.beforeEach(async ({ page }) => {
  await resetBookingSideEffects();
  await mockTurnstile(page);
});

test('AC-37: review step shows price analysis; totals add up; no excl. in built HTML', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for analysis math');

  await page.goto('/book');
  await page.locator('#from').selectOption('demo-airport');
  await page.locator('#to').selectOption('demo-centre');
  await page.locator('#date').fill(futureLocal(10));
  await page.locator('#pax').fill('2');
  await page.locator('#bags').fill('2');
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /^Select$/i }).first().click();
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('#pa').fill('Street 1, Athens');
  await page.locator('#da').fill('Street 2, Athens');
  await page.locator('#nm').fill('VAT Customer');
  await page.locator('#em').fill('vat@example.com');
  await page.locator('#ph').fill('+30 6900000000');
  // VIP switch input is visually hidden; force so the native checkbox still toggles.
  const vip = page.locator('#extra-vip-security');
  if (await vip.count()) await vip.check({ force: true });
  await page.getByLabel(/I accept/i).check({ force: true });
  await page.getByRole('button', { name: /Continue to review/i }).click();
  await expect(page.getByRole('heading', { name: /Review and pay/i })).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByRole('heading', { name: /Price analysis/i })).toBeVisible();
  const net = parseEuro(await page.getByTestId('review-net').innerText());
  const vat = parseEuro(await page.getByTestId('review-vat').innerText());
  const total = parseEuro(await page.getByTestId('review-total').innerText());
  expect(total).toBeGreaterThan(0);
  expect(net + vat).toBe(total);
  // Stored formula at 24%: vat = gross − round(gross × 10000 / 12400)
  expect(vat).toBe(total - Math.round((total * 10000) / 12400));
  await expect(page.getByText(/VAT 24%/i)).toBeVisible();
  await expect(page.locator('.pay-card').getByText(/Final price per vehicle, VAT included/i)).toBeVisible();

  const body = await page.locator('body').innerText();
  expect(body.toLowerCase()).not.toMatch(/excl\./);
  expect(body.toLowerCase()).not.toMatch(/exclusive of/);

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
  expect(bad, JSON.stringify(bad.map((v) => ({ id: v.id, help: v.help })))).toEqual([]);
});
