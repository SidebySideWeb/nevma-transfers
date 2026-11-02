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

function futureParts(hoursAhead = 4): { date: string; time: string } {
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

/** Open a BrandDropdown (`#b-from` / `#b-to`) and pick an option by its visible label. */
async function setZone(page: Page, id: 'b-from' | 'b-to', optionLabel: RegExp | string) {
  await page.locator(`#${id}`).click();
  await page.getByRole('option', { name: optionLabel }).click();
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

/** Pick YYYY-MM-DD on the V2 DateField (`#b-date` button + calendar dialog). */
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

async function fillSearchTransfer(page: Page, hoursAhead = 8) {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /Where and when/i })).toBeVisible();
  await setZone(page, 'b-from', /Athens International Airport|AIA/i);
  await setZone(page, 'b-to', /^DEMO Athens$|^Athens$/i);
  const { date, time } = futureParts(hoursAhead);
  await setPickupDate(page, date);
  await page.locator('#b-time').fill(time);
  await page.locator('#b-pick').fill('Street 1, Athens');
  await page.locator('#b-drop').fill('Street 2, Athens');
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function continueWithFirstVehicle(page: Page) {
  const group = page.getByRole('radiogroup', { name: /Choose your vehicle/i });
  await expect(group.getByRole('radio').first()).toBeVisible({ timeout: 15_000 });
  await group.getByRole('radio').first().click();
  await page.getByRole('button', { name: /Continue with/i }).click();
}

test.beforeEach(async ({ page }) => {
  await resetBookingSideEffects();
  await mockTurnstile(page);
});

test('AC-01: full transfer booking reaches hand-off', async ({ page }, testInfo) => {
  // Stagger parallel phone/desktop so they do not exhaust the same slot.
  await fillSearchTransfer(page, 8 + testInfo.project.name.length);
  await continueWithFirstVehicle(page);
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('#b-name').fill('Test Customer');
  await page.locator('#b-email').fill('customer@example.com');
  await page.locator('#b-phone').fill('+30 6900000000');
  await page.getByLabel(/I accept/i).check();
  await page.getByRole('button', { name: /Review & pay/i }).click();
  await expect(page.getByRole('heading', { name: /Review and pay/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Pay .+ securely/i }).click();
  await expect(page.getByRole('heading', { name: /Taking you to Viva/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue to payment/i })).toBeVisible();
});

test('hourly booking for 4 hours', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /Where and when/i })).toBeVisible();
  await page.getByRole('button', { name: /By the hour/i }).click();
  await expect(page.getByRole('button', { name: /By the hour/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#b-to')).toHaveCount(0);
  await setZone(page, 'b-from', /DEMO Athens|^Athens$/i);
  const hoursGroup = page.getByRole('group', { name: /Number of hours/i });
  await expect(hoursGroup).toBeVisible();
  // Click "+" until the group shows 4 (class min may already be 3 or 4).
  for (let i = 0; i < 4; i++) {
    const text = await hoursGroup.innerText();
    if (/\b4\b/.test(text)) break;
    await hoursGroup.getByRole('button', { name: /More/i }).click();
  }
  await expect(hoursGroup).toContainText('4');
  const { date, time } = futureParts(36);
  await setPickupDate(page, date);
  await page.locator('#b-time').fill(time);
  await page.locator('#b-pick').fill('Street 1, Athens');
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
  await continueWithFirstVehicle(page);
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });
});

test('AC-16: no-price pair shows contact block', async ({ page }) => {
  await page.goto('/book');
  // Live catalog labels (demo seed used "DEMO Northern suburbs" → "DEMO Piraeus port").
  await setZone(page, 'b-from', /Athens North|Northern/i);
  await setZone(page, 'b-to', /^Piraeus port$/i);
  const { date, time } = futureParts(5);
  await setPickupDate(page, date);
  await page.locator('#b-time').fill(time);
  // Bump pax/bags to 7 via steppers (default is usually 1–2).
  const paxMore = page.getByRole('button', { name: /More passengers/i });
  const bagsMore = page.getByRole('button', { name: /More luggage/i });
  for (let i = 0; i < 6; i++) {
    if (await paxMore.isEnabled()) await paxMore.click();
    if (await bagsMore.isEnabled()) await bagsMore.click();
  }
  await page.getByRole('button', { name: /See vehicles/i }).click();
  await expect(page.getByRole('heading', { name: /Choose your vehicle/i })).toBeVisible({
    timeout: 15_000,
  });
  const contact = page.getByText(/cannot price this trip online/i);
  const noPrice = page.getByText(/no online price/i);
  await expect(contact.or(noPrice).first()).toBeVisible();
});

test('AC-19: axe on each step + keyboard path', async ({ page }) => {
  await fillSearchTransfer(page);
  for (const heading of [/Where and when/i, /Choose your vehicle/i]) {
    if (heading.source?.includes('Where')) {
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
  await page.getByRole('radiogroup', { name: /Choose your vehicle/i }).getByRole('radio').first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Continue with/i }).click();
  await expect(page.getByRole('heading', { name: /Your details/i })).toBeVisible({ timeout: 15_000 });

  const detailsAxe = await new AxeBuilder({ page }).analyze();
  expect(
    detailsAxe.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')),
  ).toEqual([]);
});
