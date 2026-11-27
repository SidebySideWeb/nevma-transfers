import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import { BookingError } from '../booking/types';
import { dbFromPool, setBookingDb } from './db';
import { fail } from './http';
import { createOfficeBooking, recordOfflinePayment } from './office-booking';
import { FakePaymentProvider, resetPaymentProvider } from './payments';
import { clearSettingsCache } from './settings';
import { sign, verifySignature } from './signing';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const SECRET = 'test-admin-web-signing-secret-32chars!!';

let slotCounter = 0;
const futureLocal = () => {
  // Far future, unique hour per call so parallel holds in one test do not collide.
  slotCounter += 1;
  const d = new Date(Date.UTC(2027, 5, 15, 8 + slotCounter, 0, 0));
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
};

describe.skipIf(!hasDatabaseUrl)('office booking API (prompt 2)', () => {
  let db: TestDb;
  let payments: FakePaymentProvider;
  let staffId: string;

  beforeEach(async () => {
    slotCounter = 0;
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    payments = resetPaymentProvider();
    process.env.ADMIN_TO_WEB_SIGNING_SECRET = SECRET;

    staffId = randomUUID();
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'office@example.com')`, [
      staffId,
    ]);
    await db.pool.query(
      `insert into public.staff (user_id, email, name) values ($1, 'office@example.com', 'Office')`,
      [staffId],
    );
  });

  afterEach(async () => {
    setBookingDb(null);
    clearSettingsCache();
    await db?.drop();
  });

  function baseBody(over: Record<string, unknown> = {}) {
    return {
      idempotencyKey: randomUUID(),
      staffUserId: staffId,
      customer: {
        name: 'Phone Guest',
        email: 'phone@example.com',
        phone: '+306900000001',
      },
      bookingType: 'transfer' as const,
      classKey: 'demo-e-class',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      pickupLocal: futureLocal(),
      pickupAddress: 'Arrivals',
      dropoffAddress: 'Hotel',
      passengers: 2,
      luggage: 2,
      extras: [] as string[],
      payment: 'offline_paid' as const,
      offlineMethod: 'cash' as const,
      emailCustomer: false,
      ...over,
    };
  }

  it('rejects unsigned or stale requests', async () => {
    const body = JSON.stringify(baseBody());
    const now = Math.floor(Date.now() / 1000);
    const bad = new Request('http://localhost/api/internal/bookings', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(now),
        'x-tem-signature': '00'.repeat(32),
        'x-tem-staff': staffId,
      },
      body,
    });
    await expect(verifySignature(bad)).rejects.toMatchObject({ message: 'bad_signature' });
    expect(
      fail(
        new BookingError('invalid_request', {
          stringKey: 'error.invalid_request',
          message: 'bad_signature',
        }),
        401,
      ).status,
    ).toBe(401);

    const stale = new Request('http://localhost/api/internal/bookings', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(now - 600),
        'x-tem-signature': sign(body, now - 600),
        'x-tem-staff': staffId,
      },
      body,
    });
    await expect(verifySignature(stale)).rejects.toMatchObject({ message: 'timestamp_skew' });
  });

  it('allows an override with or without a reason and never trusts a client price', async () => {
    await expect(
      createOfficeBooking(baseBody({ price: 1 }), staffId),
    ).rejects.toMatchObject({ message: expect.stringContaining('money field') });

    const withReason = await createOfficeBooking(
      baseBody({
        priceOverrideCents: 5000,
        priceOverrideReason: 'Partner rate',
        payment: 'offline_collect',
        offlineMethod: 'bank_transfer',
      }),
      staffId,
    );
    const withReasonRow = (
      await db.pool.query(
        `select price_cents, list_price_cents, price_override_reason, status, payment_status
           from public.bookings where reference = $1`,
        [withReason.reference],
      )
    ).rows[0];
    expect(withReasonRow.price_cents).toBe(5000);
    expect(withReasonRow.list_price_cents).toBeGreaterThan(5000);
    expect(withReasonRow.price_override_reason).toBe('Partner rate');
    expect(withReasonRow.status).toBe('confirmed');
    expect(withReasonRow.payment_status).toBe('unpaid');

    const noReason = await createOfficeBooking(
      baseBody({
        priceOverrideCents: 4500,
        payment: 'offline_collect',
        offlineMethod: 'cash',
        customer: { name: 'No Reason', email: 'nr@override.test', phone: '+305' },
      }),
      staffId,
    );
    const noReasonRow = (
      await db.pool.query(
        `select price_cents, price_override_reason from public.bookings where reference = $1`,
        [noReason.reference],
      )
    ).rows[0];
    expect(noReasonRow.price_cents).toBe(4500);
    expect(noReasonRow.price_override_reason).toBeNull();

    const noOverride = await createOfficeBooking(
      baseBody({
        payment: 'offline_collect',
        offlineMethod: 'cash',
        customer: { name: 'List Price', email: 'lp@override.test', phone: '+306' },
      }),
      staffId,
    );
    const noOverrideRow = (
      await db.pool.query(
        `select price_cents, list_price_cents, price_override_reason from public.bookings where reference = $1`,
        [noOverride.reference],
      )
    ).rows[0];
    expect(noOverrideRow.price_cents).toBe(noOverrideRow.list_price_cents);
    expect(noOverrideRow.price_override_reason).toBeNull();
  });

  it('stores an optional travel voucher code on create', async () => {
    const withCode = await createOfficeBooking(
      baseBody({
        voucherCode: 'EMP-2026-TEST',
        payment: 'offline_collect',
        offlineMethod: 'cash',
        customer: { name: 'Voucher', email: 'v@voucher.test', phone: '+307' },
      }),
      staffId,
    );
    const row = (
      await db.pool.query(`select voucher_code from public.bookings where reference = $1`, [
        withCode.reference,
      ])
    ).rows[0];
    expect(row.voucher_code).toBe('EMP-2026-TEST');

    const blank = await createOfficeBooking(
      baseBody({
        voucherCode: '',
        payment: 'offline_collect',
        offlineMethod: 'cash',
        customer: { name: 'No Voucher', email: 'nv@voucher.test', phone: '+308' },
      }),
      staffId,
    );
    const blankRow = (
      await db.pool.query(`select voucher_code from public.bookings where reference = $1`, [
        blank.reference,
      ])
    ).rows[0];
    expect(blankRow.voucher_code).toBeNull();
  });

  it('allows empty customer email unless payment=link or emailCustomer', async () => {
    await expect(
      createOfficeBooking(
        baseBody({
          payment: 'link',
          offlineMethod: undefined,
          emailCustomer: false,
          customer: { name: 'Walk-in', email: '', phone: '+306900000099' },
        }),
        staffId,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('email') });

    await expect(
      createOfficeBooking(
        baseBody({
          payment: 'offline_collect',
          offlineMethod: 'cash',
          emailCustomer: true,
          customer: { name: 'Walk-in', email: '', phone: '+306900000098' },
        }),
        staffId,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('email') });

    const walkIn = await createOfficeBooking(
      baseBody({
        payment: 'offline_collect',
        offlineMethod: 'cash',
        emailCustomer: false,
        customer: { name: 'Walk-in', email: '', phone: '+306900000097' },
      }),
      staffId,
    );
    expect(walkIn.status).toBe('confirmed');
    const row = (
      await db.pool.query(
        `select customer_email, customer_id from bookings where reference = $1`,
        [walkIn.reference],
      )
    ).rows[0];
    expect(row.customer_email).toBe('');
    expect(row.customer_id).toBeNull();
  });

  it('creates link / offline-paid / to-collect bookings with the right status and payments', async () => {
    const link = await createOfficeBooking(
      baseBody({
        payment: 'link',
        offlineMethod: undefined,
        customer: { name: 'L', email: 'l@link.test', phone: '+301' },
      }),
      staffId,
    );
    expect(link.status).toBe('pending');
    expect(link.paymentStatus).toBe('unpaid');
    expect(link.checkoutUrl).toBeTruthy();
    expect(payments.orders).toHaveLength(1);
    const linkRow = (
      await db.pool.query(`select source, payment_method, hold_expires_at from bookings where reference = $1`, [
        link.reference,
      ])
    ).rows[0];
    expect(linkRow.source).toBe('office');
    expect(linkRow.payment_method).toBe('viva');
    expect(linkRow.hold_expires_at).toBeTruthy();

    const paid = await createOfficeBooking(
      baseBody({
        payment: 'offline_paid',
        offlineMethod: 'cash',
        customer: { name: 'P', email: 'p@paid.test', phone: '+302' },
      }),
      staffId,
    );
    expect(paid.status).toBe('confirmed');
    expect(paid.paymentStatus).toBe('paid');
    const payRows = (
      await db.pool.query(
        `select kind, status, method, viva_transaction_id from payments where booking_id = (select id from bookings where reference = $1)`,
        [paid.reference],
      )
    ).rows;
    expect(payRows).toHaveLength(1);
    expect(payRows[0]).toMatchObject({
      kind: 'payment',
      status: 'succeeded',
      method: 'cash',
      viva_transaction_id: null,
    });

    // Partner / monthly clearance: €0 override + offline_paid → paid, no payments row
    // (payments_amount_cents_check requires amount_cents > 0).
    const zeroFare = await createOfficeBooking(
      baseBody({
        payment: 'offline_paid',
        offlineMethod: 'cash',
        priceOverrideCents: 0,
        priceOverrideReason: 'Monthly partner clearance',
        customer: { name: 'Z', email: 'z@zero.test', phone: '+304' },
      }),
      staffId,
    );
    expect(zeroFare.status).toBe('confirmed');
    expect(zeroFare.paymentStatus).toBe('paid');
    const zeroPays = (
      await db.pool.query(
        `select count(*)::int n from payments where booking_id = (select id from bookings where reference = $1)`,
        [zeroFare.reference],
      )
    ).rows[0].n;
    expect(zeroPays).toBe(0);
    const zeroBooking = (
      await db.pool.query(
        `select price_cents, payment_status from bookings where reference = $1`,
        [zeroFare.reference],
      )
    ).rows[0];
    expect(zeroBooking).toMatchObject({ price_cents: 0, payment_status: 'paid' });

    const collect = await createOfficeBooking(
      baseBody({
        payment: 'offline_collect',
        offlineMethod: 'on_account',
        customer: { name: 'C', email: 'c@collect.test', phone: '+303' },
      }),
      staffId,
    );
    expect(collect.status).toBe('confirmed');
    expect(collect.paymentStatus).toBe('unpaid');
    const collectPays = (
      await db.pool.query(
        `select count(*)::int n from payments where booking_id = (select id from bookings where reference = $1)`,
        [collect.reference],
      )
    ).rows[0].n;
    expect(collectPays).toBe(0);

    const recorded = await recordOfflinePayment(
      {
        idempotencyKey: randomUUID(),
        reference: collect.reference,
        method: 'cash',
        note: 'Received at desk',
      },
      staffId,
    );
    expect(recorded.paymentStatus).toBe('paid');
  });

  it('repeated idempotency key returns the first result', async () => {
    const key = randomUUID();
    const first = await createOfficeBooking(baseBody({ idempotencyKey: key }), staffId);
    const second = await createOfficeBooking(baseBody({ idempotencyKey: key }), staffId);
    expect(second.reference).toBe(first.reference);
    const { rows } = await db.pool.query(
      `select count(*)::int n from bookings where visitor_key = $1`,
      [`office-idem:${key}`],
    );
    expect(rows[0].n).toBe(1);
  });
});
