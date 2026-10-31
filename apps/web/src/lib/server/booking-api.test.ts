import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import {
  bookingStatus,
  cancelBooking,
  createBooking,
  createHold,
  hashCancelToken,
  quote,
  releaseHold,
  requireTurnstile,
  setSanityVehicleClasses,
} from './booking-service';
import { dbFromPool, setBookingDb } from './db';
import { fail } from './http';
import { FakePaymentProvider, resetPaymentProvider } from './payments';
import { clearSettingsCache } from './settings';
import { resetTurnstileVerifier, setTurnstileVerifier } from './turnstile';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const futureLocal = () => {
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
  // Europe/Athens approx: format as local Athens by using Intl
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

const soonLocal = () => {
  const d = new Date(Date.now() + 30 * 60 * 1000);
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

describe.skipIf(!hasDatabaseUrl)('booking API (prompt 06)', () => {
  let db: TestDb;
  let payments: FakePaymentProvider;
  const ip = '203.0.113.10';

  beforeEach(async () => {
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    payments = resetPaymentProvider();
    setTurnstileVerifier(async () => true);
    setSanityVehicleClasses([
      { key: 'demo-sedan', name: 'DEMO Executive sedan', tagline: 'Sedan' },
      { key: 'demo-suv', name: 'DEMO Premium SUV', tagline: 'SUV' },
      { key: 'demo-van', name: 'DEMO Executive van', tagline: 'Van' },
    ]);
  });

  afterEach(async () => {
    setBookingDb(null);
    resetTurnstileVerifier();
    setSanityVehicleClasses(null);
    clearSettingsCache();
    await db?.drop();
  });

  it('AC-01: a body with amount → 400; total = base + extras', async () => {
    const bad = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        amount: 7000,
      },
      ip,
    ).then(
      () => null,
      (e) => e,
    );
    expect(bad).toBeTruthy();
    expect(fail(bad!).status).toBe(400);

    const hold = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        classKey: 'demo-sedan',
        turnstileToken: 'ok',
      },
      'vid-ac01',
      ip,
    );
    const booking = await createBooking(
      {
        holdId: hold.holdId,
        pickupAddress: 'Street 1',
        dropoffAddress: 'Street 2',
        passengers: 2,
        luggage: 2,
        extras: ['vip-security'],
        customer: { name: 'A', email: 'a@example.com', phone: '+30 6900000000' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-ac01',
      ip,
    );
    expect(booking.totalCents).toBe(hold.baseCents + 15000);
    expect(booking.lines).toHaveLength(2);
  });

  it('AC-04: expired hold no longer blocks quote; booking cannot be created', async () => {
    const pickup = futureLocal();
    const hold = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: pickup,
        passengers: 2,
        luggage: 2,
        classKey: 'demo-sedan',
        turnstileToken: 'ok',
      },
      'vid-a',
      ip,
    );
    await db.pool.query(
      `update public.slot_holds set expires_at = now() - interval '1 minute' where id = $1`,
      [hold.holdId],
    );

    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: pickup,
        passengers: 2,
        luggage: 2,
      },
      '203.0.113.20',
    );
    const sedan = q.options.find((o) => o.classKey === 'demo-sedan');
    expect(sedan?.available).toBe(true);

    await expect(
      createBooking(
        {
          holdId: hold.holdId,
          pickupAddress: 'Street 1',
          dropoffAddress: 'Street 2',
          passengers: 2,
          luggage: 2,
          extras: [],
          customer: { name: 'A', email: 'a@example.com', phone: '+30 6900000000' },
          consent: true,
          turnstileToken: 'ok',
        },
        'vid-a',
        ip,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('AC-05: 2 holds OK, 3rd → 429; last vehicle taken blocks quote for other visitor', async () => {
    // Reduce fleet of demo-sedan to 1 vehicle for last-slot part
    await db.pool.query(
      `delete from public.vehicles
        where class_id = (select id from public.vehicle_classes where key = 'demo-sedan')
          and label like '%-2'`,
    );

    const pickup = futureLocal();
    const h1 = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: pickup,
        passengers: 2,
        luggage: 2,
        classKey: 'demo-sedan',
        turnstileToken: 'ok',
      },
      'vid-limit',
      '203.0.113.30',
    );
    expect(h1.holdId).toBeTruthy();

    // Different pickup so holds don't collide on availability for the 2-hold limit test
    const pickup2Parts = futureLocal();
    await createHold(
      {
        type: 'hourly',
        fromZone: 'demo-centre',
        hours: 4,
        pickupLocal: pickup2Parts,
        passengers: 2,
        luggage: 2,
        classKey: 'demo-suv',
        turnstileToken: 'ok',
      },
      'vid-limit',
      '203.0.113.30',
    );

    await expect(
      createHold(
        {
          type: 'hourly',
          fromZone: 'demo-centre',
          hours: 5,
          pickupLocal: pickup2Parts,
          passengers: 2,
          luggage: 2,
          classKey: 'demo-van',
          turnstileToken: 'ok',
        },
        'vid-limit',
        '203.0.113.30',
      ),
    ).rejects.toMatchObject({ message: 'too_many_holds' });

    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: pickup,
        passengers: 2,
        luggage: 2,
      },
      '203.0.113.31',
    );
    expect(q.options.find((o) => o.classKey === 'demo-sedan')?.available).toBe(false);
  });

  it('AC-09: vip-security sets flag and line; inactive → 400', async () => {
    const hold = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        classKey: 'demo-sedan',
        turnstileToken: 'ok',
      },
      'vid-vip',
      ip,
    );
    const booking = await createBooking(
      {
        holdId: hold.holdId,
        pickupAddress: 'Street 1',
        dropoffAddress: 'Street 2',
        passengers: 2,
        luggage: 2,
        extras: ['vip-security'],
        customer: { name: 'A', email: 'a@example.com', phone: '+30 6900000000' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-vip',
      ip,
    );
    expect(booking.lines.some((l) => l.label.includes('VIP'))).toBe(true);
    const flag = await db.pool.query(
      `select vip_security from public.bookings where reference = $1`,
      [booking.reference],
    );
    expect(flag.rows[0].vip_security).toBe(true);

    await db.pool.query(`update public.extras set active = false where code = 'vip-security'`);
    const hold2 = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        classKey: 'demo-suv',
        turnstileToken: 'ok',
      },
      'vid-vip2',
      '203.0.113.40',
    );
    await expect(
      createBooking(
        {
          holdId: hold2.holdId,
          pickupAddress: 'Street 1',
          dropoffAddress: 'Street 2',
          passengers: 2,
          luggage: 2,
          extras: ['vip-security'],
          customer: { name: 'B', email: 'b@example.com', phone: '+30 6900000001' },
          consent: true,
          turnstileToken: 'ok',
        },
        'vid-vip2',
        '203.0.113.40',
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('AC-12: cancel inside window refunds; second use 400; outside → tooLate', async () => {
    const token = randomBytes(32).toString('base64url');
    const hash = hashCancelToken(token);
    const pickupFar = new Date(Date.now() + 48 * 3600_000);
    const inserted = await db.pool.query(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status, cancel_token_hash, viva_order_code
       )
       select 'transfer', c.id, za.id, zb.id,
              'A', 'B', $1::timestamptz, 45,
              public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
              2, 2, 'C', 'c@example.com', '+30 1',
              7000, 22000, 'confirmed', 'paid', $2, 999001
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-sedan'
       returning reference`,
      [pickupFar.toISOString(), hash],
    );
    const reference = inserted.rows[0].reference;

    const txId = '11111111-1111-1111-1111-111111111111';
    await db.pool.query(
      `insert into public.payments (booking_id, kind, status, amount_cents, viva_transaction_id)
       select id, 'payment', 'succeeded', 22000, $1::uuid from public.bookings where reference = $2`,
      [txId, reference],
    );

    const cancelled = await cancelBooking({ token, turnstileToken: 'ok' }, ip);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.refundCents).toBe(22000);
    expect(payments.refunds).toHaveLength(1);
    expect(payments.refunds[0]?.transactionId).toBe(txId);
    expect(cancelled.reference).toBe(reference);

    await expect(cancelBooking({ token, turnstileToken: 'ok' }, ip)).rejects.toMatchObject({
      code: 'invalid_request',
    });

    const token2 = randomBytes(32).toString('base64url');
    const hash2 = createHash('sha256').update(token2).digest('hex');
    const pickupSoon = new Date(Date.now() + 2 * 3600_000);
    await db.pool.query(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status, cancel_token_hash
       )
       select 'transfer', c.id, za.id, zb.id,
              'A', 'B', $1::timestamptz, 45,
              public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
              2, 2, 'C', 'c@example.com', '+30 1',
              7000, 7000, 'confirmed', 'paid', $2
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-sedan'`,
      [pickupSoon.toISOString(), hash2],
    );
    await expect(cancelBooking({ token: token2, turnstileToken: 'ok' }, ip)).rejects.toMatchObject({
      stringKey: 'booking.cancel.tooLate',
    });
  });

  it('AC-15: lead time rejected', async () => {
    await expect(
      quote(
        {
          type: 'transfer',
          fromZone: 'demo-airport',
          toZone: 'demo-centre',
          pickupLocal: soonLocal(),
          passengers: 2,
          luggage: 2,
        },
        '203.0.113.50',
      ),
    ).rejects.toMatchObject({ stringKey: 'error.lead_time' });
  });

  it('AC-16: demo-north → demo-port with demo-van → no_price', async () => {
    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-north',
        toZone: 'demo-port',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
      },
      '203.0.113.51',
    );
    expect(q.options.find((o) => o.classKey === 'demo-van')).toMatchObject({
      baseCents: null,
      reason: 'no_price',
    });

    await expect(
      createHold(
        {
          type: 'transfer',
          fromZone: 'demo-north',
          toZone: 'demo-port',
          pickupLocal: futureLocal(),
          passengers: 2,
          luggage: 2,
          classKey: 'demo-van',
          turnstileToken: 'ok',
        },
        'vid-noprice',
        '203.0.113.52',
      ),
    ).rejects.toMatchObject({ code: 'no_price' });
  });

  it('AC-17: changing zone price after booking leaves total unchanged', async () => {
    const hold = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        classKey: 'demo-sedan',
        turnstileToken: 'ok',
      },
      'vid-price',
      ip,
    );
    const booking = await createBooking(
      {
        holdId: hold.holdId,
        pickupAddress: 'Street 1',
        dropoffAddress: 'Street 2',
        passengers: 2,
        luggage: 2,
        extras: [],
        customer: { name: 'A', email: 'a@example.com', phone: '+30 6900000000' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-price',
      ip,
    );
    const locked = booking.totalCents;
    await db.pool.query(
      `update public.zone_prices set price_cents = price_cents + 5000
        where class_id = (select id from public.vehicle_classes where key = 'demo-sedan')`,
    );
    const row = await db.pool.query(`select price_cents from public.bookings where reference = $1`, [
      booking.reference,
    ]);
    expect(row.rows[0].price_cents).toBe(locked);
    expect(payments.orders[0]).toBeTruthy();
  });

  it('AC-23: missing/failing Turnstile → 400; rate limit → 429', async () => {
    setTurnstileVerifier(async () => false);
    await expect(
      createHold(
        {
          type: 'transfer',
          fromZone: 'demo-airport',
          toZone: 'demo-centre',
          pickupLocal: futureLocal(),
          passengers: 2,
          luggage: 2,
          classKey: 'demo-sedan',
          turnstileToken: 'bad',
        },
        'vid-ts',
        ip,
      ),
    ).rejects.toMatchObject({ message: 'turnstile_failed' });

    setTurnstileVerifier(async () => true);
    // Exhaust quote limit (30/min) quickly with a unique IP
    const limitIp = '198.51.100.99';
    for (let i = 0; i < 30; i++) {
      await quote(
        {
          type: 'transfer',
          fromZone: 'demo-airport',
          toZone: 'demo-centre',
          pickupLocal: futureLocal(),
          passengers: 2,
          luggage: 2,
        },
        limitIp,
      );
    }
    try {
      await quote(
        {
          type: 'transfer',
          fromZone: 'demo-airport',
          toZone: 'demo-centre',
          pickupLocal: futureLocal(),
          passengers: 2,
          luggage: 2,
        },
        limitIp,
      );
      expect.fail('expected rate limit');
    } catch (e) {
      const res = fail(e);
      expect(res.status).toBe(429);
    }

    // missing turnstile token on requireTurnstile
    await expect(requireTurnstile(undefined)).rejects.toMatchObject({ message: 'turnstile_failed' });
  });

  it('booking-status returns reference/status/payment only', async () => {
    const hold = await createHold(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        classKey: 'demo-sedan',
        turnstileToken: 'ok',
      },
      'vid-status',
      ip,
    );
    const booking = await createBooking(
      {
        holdId: hold.holdId,
        pickupAddress: 'Street 1',
        dropoffAddress: 'Street 2',
        passengers: 2,
        luggage: 2,
        extras: [],
        customer: { name: 'Secret Name', email: 'secret@example.com', phone: '+30 6999999999' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-status',
      ip,
    );
    const orderCode = payments.orders[0]!.orderCode;
    const status = await bookingStatus(orderCode);
    expect(status).toEqual({
      reference: booking.reference,
      status: 'pending',
      paymentStatus: 'unpaid',
    });
    expect(JSON.stringify(status)).not.toMatch(/secret@example\.com|Secret Name|6999999999/i);

    await releaseHold(hold.holdId, 'vid-status').catch(() => {
      /* already converted */
    });
  });
});
