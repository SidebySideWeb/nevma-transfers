import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';

const PLACE_ID = 'ChIJVXealLU_xkcRja_At0z9AGY';
const databaseUrl =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

async function mockPlaces(page: Page) {
  await page.route('**/api/places/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/autocomplete')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggestions: [
            {
              placeId: PLACE_ID,
              label: 'Hilton Athens, Vasilissis Sofias 46, Athens, Greece',
              main: 'Hilton Athens',
              secondary: 'Vasilissis Sofias 46, Athens, Greece',
            },
          ],
        }),
      });
      return;
    }
    if (url.includes('/details')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          placeId: PLACE_ID,
          address: 'Vasilissis Sofias 46, Athens, Greece',
          lat: 37.9767,
          lng: 23.7503,
        }),
      });
      return;
    }
    await route.continue();
  });
}

function futureParts(hoursAhead = 8): { date: string; time: string } {
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
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

async function setZone(page: Page, id: 'b-from' | 'b-to', optionLabel: RegExp | string) {
  await page.locator(`#${id}`).click();
  await page.getByRole('option', { name: optionLabel }).click();
}

async function setPickupDate(page: Page, iso: string) {
  const [ys, ms, ds] = iso.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const title = `${MONTHS[m - 1]} ${y}`;
  await page.locator('#b-date').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 24; i++) {
    const t = await dialog.locator('.ep-cal-title').innerText();
    if (t.trim() === title) break;
    const [curMonth, curYear] = t.trim().split(/\s+/);
    const curM = MONTHS.indexOf(curMonth as (typeof MONTHS)[number]) + 1;
    const curY = Number(curYear);
    const cur = curY * 12 + curM;
    const want = y * 12 + m;
    await dialog.getByRole('button', { name: want > cur ? /Next month/i : /Previous month/i }).click();
  }
  await expect(dialog.locator('.ep-cal-title')).toHaveText(title);
  await dialog.getByRole('gridcell', { name: String(d), exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEM_TURNSTILE_TOKEN__: string }).__TEM_TURNSTILE_TOKEN__ =
      'test-turnstile-token';
  });
});

test('places: pick suggestion, store place id, typed text clears place, axe list open', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.PUBLIC_ADDRESS_AUTOCOMPLETE !== 'true',
    'Set PUBLIC_ADDRESS_AUTOCOMPLETE=true (Google is mocked at /api/places)',
  );
  await mockPlaces(page);
  await page.goto('/book');
  await setZone(page, 'b-from', /Athens International Airport|AIA/i);
  await setZone(page, 'b-to', /^DEMO Athens$|^Athens$/i);

  const pick = page.locator('#b-pick');
  await pick.fill('hilton ath');
  await expect(page.getByRole('option', { name: /Hilton Athens/i })).toBeVisible({ timeout: 5_000 });

  for (const width of [390, 1440] as const) {
    await page.setViewportSize({ width, height: 900 });
    const axe = await new AxeBuilder({ page }).analyze();
    const bad = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
    expect(bad, `${width}px`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('option', { name: /Hilton Athens/i }).click();
  await expect(page.locator('input[name="pickupPlaceId"]')).toHaveValue(PLACE_ID);

  await pick.fill('Terminal 2, door 3');
  await expect(page.locator('input[name="pickupPlaceId"]')).toHaveValue('');

  await pick.fill('hilton ath');
  await expect(page.getByRole('option', { name: /Hilton Athens/i })).toBeVisible();
  await page.getByRole('option', { name: /Hilton Athens/i }).click();
  await page.locator('#b-drop').fill('Street 2, Athens');

  const { date, time } = futureParts(8 + testInfo.project.name.length);
  await setPickupDate(page, date);
  await page.locator('#b-time').fill(time);
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('radiogroup', { name: /Choose your vehicle/i }).getByRole('radio').first().click();
  await page.getByRole('button', { name: /Continue with/i }).click();
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('#b-name').fill('Places Customer');
  await page.locator('#b-email').fill('places@example.com');
  await page.locator('#b-phone').fill('+30 6900000001');
  await page.getByLabel(/I accept/i).check();
  await page.getByRole('button', { name: /Review & pay/i }).click();
  await expect(page.getByRole('heading', { name: /Review and pay/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Pay .+ securely/i }).click();
  await expect(page.getByRole('heading', { name: /Taking you to Viva/i })).toBeVisible();

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{
      pickup_place_id: string | null;
      pickup_address: string;
      reference: string;
    }>(
      `select reference, pickup_place_id, pickup_address from public.bookings
        where customer_email = 'places@example.com' order by created_at desc limit 1`,
    );
    expect(rows[0]?.pickup_place_id).toBe(PLACE_ID);
    expect(rows[0]?.pickup_address).toMatch(/Hilton/i);
  } finally {
    await client.end();
  }
});

test('places flag off: plain inputs, no list', async ({ page }) => {
  test.skip(
    process.env.PUBLIC_ADDRESS_AUTOCOMPLETE === 'true',
    'Run with PUBLIC_ADDRESS_AUTOCOMPLETE=false to assert plain fields',
  );
  await page.goto('/book');
  await page.locator('#b-pick').fill('hilton ath');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('#b-pick')).not.toHaveAttribute('role', 'combobox');
});
