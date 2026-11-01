import { createHash, randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';

const databaseUrl =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Tiny RFC 5545 parser for AC-36. */
function parseIcs(raw: string): { uid?: string; dtstart?: string; duration?: string } {
  const out: { uid?: string; dtstart?: string; duration?: string } = {};
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('UID:')) out.uid = line.slice(4);
    if (line.startsWith('DTSTART:')) out.dtstart = line.slice(8);
    if (line.startsWith('DURATION:')) out.duration = line.slice(9);
  }
  return out;
}

async function resetSideEffects() {
  await withDb(async (c) => {
    await c.query(
      'truncate table rate_limits, booking_extras, payments, slot_holds, bookings restart identity cascade',
    );
  });
}

async function insertConfirmed(opts: {
  token: string;
  /** ISO instant for pickup (use a DST-period Athens time). */
  pickupAt: string;
  priceCents?: number;
  flight?: string;
}): Promise<{ reference: string }> {
  const hash = hashToken(opts.token);
  const priceCents = opts.priceCents ?? 22000;
  const orderCode = String(
    777_000_000_000_000n + BigInt(Date.now() % 1_000_000_000) * 1000n + BigInt(Math.floor(Math.random() * 1000)),
  );
  return withDb(async (c) => {
    const { rows } = await c.query<{ reference: string; id: string }>(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, flight_number, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status, cancel_token_hash, viva_order_code
       )
       select 'transfer', c.id, za.id, zb.id,
              'AIA Terminal 1', 'Syntagma Square', $5, $1::timestamptz, 45,
              public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
              2, 2, 'E2E Ada', 'e2e-manage@example.com', '+30 6900000099',
              $2, $2, 'confirmed', 'paid', $3, $4::bigint
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-e-class'
       returning reference, id`,
      [opts.pickupAt, priceCents, hash, orderCode, opts.flight ?? 'A3 650'],
    );
    const booking = rows[0]!;
    await c.query(
      `insert into public.payments (booking_id, kind, status, amount_cents, viva_transaction_id)
       values ($1::uuid, 'payment', 'succeeded', $2, gen_random_uuid())`,
      [booking.id, priceCents],
    );
    const vip = await c.query<{ id: string }>(
      `select id from public.extras where code = 'vip-security' limit 1`,
    );
    if (vip.rows[0]) {
      await c.query(
        `insert into public.booking_extras (booking_id, extra_id, price_cents)
         values ($1::uuid, $2::uuid, 15000)`,
        [booking.id, vip.rows[0].id],
      );
    }
    return { reference: booking.reference };
  });
}

async function mockTurnstile(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __TEM_TURNSTILE_TOKEN__: string }).__TEM_TURNSTILE_TOKEN__ =
      'test-turnstile-token';
  });
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact || ''),
  );
  expect(bad, JSON.stringify(bad.map((v) => ({ id: v.id, help: v.help })))).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await resetSideEffects();
  await mockTurnstile(page);
});

test('AC-36: manage page facts, actions, ICS, cancel clears link; axe at 390/1440', async ({
  page,
  request,
}, testInfo) => {
  const token = randomBytes(32).toString('base64url');
  // Future pick-up still on Athens summer time (UTC+3) so ICS DTSTART is unambiguous across DST.
  const pickupAt = '2027-07-15T11:30:00.000+03:00';
  const { reference } = await insertConfirmed({ token, pickupAt, priceCents: 22000 });

  await page.goto(`/booking/manage/${token}`);
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText(/confirmed/i).first()).toBeVisible();
  await expect(page.getByText(/AIA Terminal 1/)).toBeVisible();
  await expect(page.getByText(/Syntagma Square/)).toBeVisible();
  await expect(page.getByText(/A3 650/)).toBeVisible();
  await expect(page.locator('.manage-facts')).toContainText(/DEMO|E-Class|Executive/i);
  await expect(page.locator('.manage-facts')).toContainText('2');
  await expect(page.locator('.manage-paid-total')).toContainText(/€\s*220\.00/);
  await expect(page.getByText(/Booked and paid|Confirmed by the office/i).first()).toBeVisible();

  const invoice = page.getByRole('link', { name: /request an invoice/i });
  await expect(invoice).toHaveAttribute('href', new RegExp(`mailto:.*subject=Invoice%20${reference}`));

  const call = page.getByRole('link', { name: /call the office/i });
  await expect(call).toHaveAttribute('href', /tel:/);

  const cal = page.getByRole('link', { name: /add to calendar/i });
  await expect(cal).toHaveAttribute('href', /calendar\.ics/);

  const cancel = page.getByRole('link', { name: /cancel this booking/i });
  await expect(cancel).toHaveAttribute('href', `/booking/cancel/${token}`);

  const icsRes = await request.get(`/booking/manage/${token}/calendar.ics`);
  expect(icsRes.ok()).toBe(true);
  expect(icsRes.headers()['content-type']).toMatch(/text\/calendar/);
  expect(icsRes.headers()['content-disposition']).toMatch(/attachment/);
  const icsBody = await icsRes.text();
  expect(icsBody).toMatch(/\r\n/);
  const parsed = parseIcs(icsBody);
  expect(parsed.uid).toBe(`${reference}@127.0.0.1:4321`);
  expect(parsed.dtstart).toBe('20270715T083000Z');
  expect(parsed.duration).toBe('PT45M');

  await axeClean(page);

  await cancel.click();
  await expect(page.getByRole('heading', { name: /Cancel your booking/i })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`cancel booking ${reference}`, 'i') }).click();
  await expect(page.getByRole('heading', { name: /has been cancelled/i })).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/booking/manage/${token}`);
  await expect(page.getByText(/no longer valid/i)).toBeVisible();

  await page.goto('/booking/find');
  await expect(page.getByRole('heading', { name: /find/i })).toBeVisible();
  await axeClean(page);

  // Viewport is set per project (phone 390 / desktop 1440).
  expect([390, 1440]).toContain(testInfo.project.use.viewport?.width);
});
