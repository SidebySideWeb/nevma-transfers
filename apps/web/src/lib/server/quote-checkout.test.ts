import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import {
  createBooking,
  quote,
  setSanityVehicleClasses,
} from './booking-service';
import { dbFromPool, setBookingDb } from './db';
import { fail } from './http';
import { FakePaymentProvider, resetPaymentProvider } from './payments';
import { clearSettingsCache } from './settings';
import { resetTurnstileVerifier, setTurnstileVerifier } from './turnstile';
import { signQuote } from './quote-crypto';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const futureLocal = () => {
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
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

describe.skipIf(!hasDatabaseUrl)('signed quote checkout (B3)', () => {
  let db: TestDb;
  const ip = '198.51.100.20';
  const secret = 'b3-test-signing-secret';

  beforeEach(async () => {
    process.env.QUOTE_SIGNING_SECRET = secret;
    process.env.GOOGLE_MAPS_SERVER_KEY = 'maps-test-key';
    process.env.FEATURE_DISTANCE_PRICING = 'false';
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    resetPaymentProvider();
    setTurnstileVerifier(async () => true);
    setSanityVehicleClasses([
      { key: 'demo-e-class', name: 'DEMO E', tagline: 'Sedan' },
      { key: 'demo-s-class', name: 'DEMO S', tagline: 'SUV' },
    ]);
  });

  afterEach(async () => {
    delete process.env.QUOTE_SIGNING_SECRET;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.FEATURE_DISTANCE_PRICING;
    setBookingDb(null);
    resetTurnstileVerifier();
    setSanityVehicleClasses(null);
    clearSettingsCache();
    await db?.drop();
  });

  it('returns signed quote wrapping zone prices; browser amount ignored', async () => {
    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
      },
      ip,
    );
    expect(q.quoteId).toBeTruthy();
    expect(q.signature).toBeTruthy();
    expect(q.distanceKm).toBeNull();
    expect(q.classes?.some((c) => c.key === 'demo-e-class' && c.total != null)).toBe(true);
    expect(q.options[0]?.baseCents).toBeTruthy();

    const bad = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 2,
        price: 1,
      },
      ip,
    ).then(
      () => null,
      (e) => e,
    );
    expect(fail(bad!).status).toBe(400);
  });

  it('tampered signature → 403', async () => {
    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 1,
      },
      ip,
    );
    const err = await createBooking(
      {
        quoteId: q.quoteId,
        signature: '0'.repeat(64),
        classKey: 'demo-e-class',
        pickupAddress: 'Airport',
        dropoffAddress: 'Centre',
        passengers: 2,
        luggage: 1,
        extras: [],
        customer: { name: 'A', email: 'a@example.com', phone: '+301' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-tamper',
      ip,
    ).then(
      () => null,
      (e) => e,
    );
    expect(fail(err!).status).toBe(403);
  });

  it('expired quote → 409 quote_expired', async () => {
    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 1,
      },
      ip,
    );
    await db.pool.query(`update quotes set expires_at = now() - interval '1 minute' where id = $1`, [
      q.quoteId,
    ]);
    const { rows } = await db.pool.query<{ expires_at: Date }>(
      `select expires_at from quotes where id = $1`,
      [q.quoteId],
    );
    const expiresAt = new Date(rows[0]!.expires_at).toISOString();
    const signature = signQuote(secret, q.quoteId!, expiresAt);
    const err = await createBooking(
      {
        quoteId: q.quoteId,
        signature,
        classKey: 'demo-e-class',
        pickupAddress: 'Airport',
        dropoffAddress: 'Centre',
        passengers: 2,
        luggage: 1,
        extras: [],
        customer: { name: 'A', email: 'a@example.com', phone: '+301' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-exp',
      ip,
    ).then(
      () => null,
      (e) => e,
    );
    expect(fail(err!).status).toBe(409);
    expect((err as { code: string }).code).toBe('quote_expired');
  });

  it('unavailable classKey → 409', async () => {
    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 1,
      },
      ip,
    );
    const err = await createBooking(
      {
        quoteId: q.quoteId,
        signature: q.signature,
        classKey: 'demo-sprinter',
        pickupAddress: 'Airport',
        dropoffAddress: 'Centre',
        passengers: 2,
        luggage: 1,
        extras: [],
        customer: { name: 'A', email: 'a@example.com', phone: '+301' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-unavail',
      ip,
    ).then(
      () => null,
      (e) => e,
    );
    // sprinter may be priced but capacity/availability — force unavailable in prices
    if (!err) {
      // mark class unavailable in quote then retry
      await db.pool.query(
        `update quotes set prices = prices || '{"demo-e-class":{"total":7000,"available":false}}'::jsonb where id = $1`,
        [q.quoteId],
      );
      const err2 = await createBooking(
        {
          quoteId: q.quoteId,
          signature: q.signature,
          classKey: 'demo-e-class',
          pickupAddress: 'Airport',
          dropoffAddress: 'Centre',
          passengers: 2,
          luggage: 1,
          extras: [],
          customer: { name: 'A', email: 'a@example.com', phone: '+301' },
          consent: true,
          turnstileToken: 'ok',
        },
        'vid-unavail2',
        ip,
      ).then(
        () => null,
        (e) => e,
      );
      expect(fail(err2!).status).toBe(409);
    } else {
      expect(fail(err).status).toBe(409);
    }
  });

  it('checkout from valid quote creates Viva order (ignores client price)', async () => {
    const payments = resetPaymentProvider() as FakePaymentProvider;
    const q = await quote(
      {
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: futureLocal(),
        passengers: 2,
        luggage: 1,
      },
      ip,
    );
    const booked = await createBooking(
      {
        quoteId: q.quoteId,
        signature: q.signature,
        classKey: 'demo-e-class',
        pickupAddress: 'Airport',
        dropoffAddress: 'Centre',
        passengers: 2,
        luggage: 1,
        extras: [],
        customer: { name: 'A', email: 'a@example.com', phone: '+301' },
        consent: true,
        turnstileToken: 'ok',
        amount: 1,
      },
      'vid-ok',
      ip,
    ).then(
      (r) => r,
      () => null,
    );
    // amount rejected before parse
    expect(booked).toBeNull();

    const booked2 = await createBooking(
      {
        quoteId: q.quoteId,
        signature: q.signature,
        classKey: 'demo-e-class',
        pickupAddress: 'Airport',
        dropoffAddress: 'Centre',
        passengers: 2,
        luggage: 1,
        extras: [],
        customer: { name: 'A', email: 'a@example.com', phone: '+301' },
        consent: true,
        turnstileToken: 'ok',
      },
      'vid-ok2',
      ip,
    );
    expect(booked2.reference).toMatch(/^EP-/);
    expect(booked2.checkoutUrl).toBeTruthy();
    expect(booked2.totalCents).toBeGreaterThan(0);
    expect(payments.orders.length).toBe(1);
    expect(booked2.checkoutUrl).toContain(payments.orders[0]!.orderCode);
  });
});
