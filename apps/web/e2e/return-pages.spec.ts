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

async function resetSideEffects() {
  await withDb(async (c) => {
    await c.query(
      'truncate table rate_limits, booking_extras, payments, slot_holds, bookings restart identity cascade',
    );
  });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function insertPendingOrder(opts: {
  orderCode: string;
  priceCents?: number;
  holdMinutes?: number;
}): Promise<{ reference: string }> {
  const priceCents = opts.priceCents ?? 7000;
  const holdMinutes = opts.holdMinutes ?? 20;
  return withDb(async (c) => {
    const { rows } = await c.query<{ reference: string }>(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status, hold_expires_at, viva_order_code,
         visitor_key
       )
       select 'transfer', c.id, za.id, zb.id,
              'A', 'B', now() + interval '48 hours', 45,
              public.blocked_range_for(now() + interval '48 hours', 45, c.buffer_minutes),
              2, 2, 'E2E', 'e2e@example.com', '+30 6900000099',
              $1, $1, 'pending', 'unpaid', now() + ($2::text || ' minutes')::interval, $3::bigint,
              'e2e-visitor'
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-e-class'
       returning reference`,
      [priceCents, holdMinutes, opts.orderCode],
    );
    return { reference: rows[0]!.reference };
  });
}

async function insertCancellable(opts: {
  token: string;
  pickupHoursFromNow: number;
  priceCents?: number;
  orderCode?: string;
}): Promise<{ reference: string }> {
  const hash = hashToken(opts.token);
  const priceCents = opts.priceCents ?? 22000;
  const orderCode =
    opts.orderCode ??
    String(888_000_000_000_000n + BigInt(Date.now() % 1_000_000_000) * 1000n + BigInt(Math.floor(Math.random() * 1000)));
  return withDb(async (c) => {
    const { rows } = await c.query<{ reference: string; id: string }>(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status, cancel_token_hash, viva_order_code
       )
       select 'transfer', c.id, za.id, zb.id,
              'A', 'B', now() + ($1::text || ' hours')::interval, 45,
              public.blocked_range_for(now() + ($1::text || ' hours')::interval, 45, c.buffer_minutes),
              2, 2, 'E2E', 'e2e@example.com', '+30 6900000099',
              $2, $2, 'confirmed', 'paid', $3, $4::bigint
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-e-class'
       returning reference, id`,
      [opts.pickupHoursFromNow, priceCents, hash, orderCode],
    );
    const booking = rows[0]!;
    await c.query(
      `insert into public.payments (booking_id, kind, status, amount_cents, viva_transaction_id)
       values ($1::uuid, 'payment', 'succeeded', $2, gen_random_uuid())`,
      [booking.id, priceCents],
    );
    return { reference: booking.reference };
  });
}

async function mockTurnstile(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __TEM_TURNSTILE_TOKEN__: string }).__TEM_TURNSTILE_TOKEN__ =
      'test-turnstile-token';
  });
}

async function expectSecureHeaders(page: Page, path: string) {
  const res = await page.request.get(path);
  expect(res.headers()['cache-control']).toMatch(/no-store/i);
  expect(res.headers()['referrer-policy']).toMatch(/no-referrer/i);
}

test.beforeEach(async ({ page }) => {
  await resetSideEffects();
  await mockTurnstile(page);
});

test('AC-06: confirmed page waits; webhook flips to confirmed; pending unchanged by visit', async ({
  page,
}) => {
  const orderCode = String(9_100_000_000_000_001n);
  const priceCents = 7000;
  await insertPendingOrder({ orderCode, priceCents });

  await page.goto(`/booking/confirmed?s=${orderCode}`);
  await expect(page.getByText(/confirming your payment/i)).toBeVisible();

  const before = await withDb(async (c) => {
    const { rows } = await c.query<{ status: string }>(
      `select status from public.bookings where viva_order_code = $1::bigint`,
      [orderCode],
    );
    return rows[0]!.status;
  });
  expect(before).toBe('pending');

  const txId = '22222222-2222-2222-2222-222222222222';
  await withDb(async (c) => {
    await c.query(`select public.record_viva_payment($1::bigint, $2::uuid, $3::int, '{}'::jsonb)`, [
      orderCode,
      txId,
      priceCents,
    ]);
  });

  await expect(page.getByRole('heading', { name: /Booking confirmed/i })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('#confirmed-body')).toContainText(/(?:EP|TEM)-/);
  const focused = await page.locator('#confirmed-title').evaluate((el) => document.activeElement === el);
  expect(focused).toBe(true);

  await expectSecureHeaders(page, `/booking/confirmed?s=${orderCode}`);
});

test('AC-12: cancel inside window once; reload invalid; outside shows tooLate', async ({
  page,
}, testInfo) => {
  const suffix = `${Date.now()}${testInfo.project.name === 'phone' ? '1' : '2'}${Math.floor(Math.random() * 1e6)}`;
  const tokenOk = randomBytes(32).toString('base64url');
  const { reference } = await insertCancellable({
    token: tokenOk,
    pickupHoursFromNow: 48,
    orderCode: `8881${suffix}`.slice(0, 18),
  });

  await page.goto(`/booking/cancel/${tokenOk}`);
  await expect(page.getByRole('heading', { name: /Cancel your booking/i })).toBeVisible();
  await expect(page.locator('dd', { hasText: reference })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`cancel booking ${reference}`, 'i') }).click();
  await expect(page.getByRole('heading', { name: /has been cancelled/i })).toBeVisible({
    timeout: 15_000,
  });
  const doneFocused = await page
    .locator('#cancel-done-title')
    .evaluate((el) => document.activeElement === el);
  expect(doneFocused).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: /no longer valid/i })).toBeVisible();

  const tokenLate = randomBytes(32).toString('base64url');
  await insertCancellable({
    token: tokenLate,
    pickupHoursFromNow: 2,
    orderCode: `8882${suffix}`.slice(0, 18),
  });
  await page.goto(`/booking/cancel/${tokenLate}`);
  await expect(page.getByText(/can no longer be cancelled online/i)).toBeVisible();

  await expectSecureHeaders(page, `/booking/cancel/${tokenLate}`);
});

test('AC-19: axe clean on return pages; not-completed headers', async ({ page }) => {
  const orderCode = String(9_100_000_000_000_002n);
  await insertPendingOrder({ orderCode });

  for (const path of [
    `/booking/confirmed?s=${orderCode}`,
    '/booking/not-completed',
    `/booking/cancel/${randomBytes(32).toString('base64url')}`,
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact || ''),
    );
    expect(bad, JSON.stringify(bad.map((v) => ({ id: v.id, help: v.help })))).toEqual([]);
  }

  await expectSecureHeaders(page, '/booking/not-completed');
});
