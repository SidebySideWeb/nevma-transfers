import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import { hashCancelToken } from './booking-service';
import { lookupBooking } from './booking-lookup';
import { managePageView } from './booking-manage';
import { dbFromPool, setBookingDb } from './db';
import { setEmailTransport, type SendEmailInput } from './email';
import { clearSettingsCache } from './settings';
import { resetTurnstileVerifier, setTurnstileVerifier } from './turnstile';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

async function insertConfirmed(opts: {
  pool: TestDb['pool'];
  email: string;
  tokenHash?: string | null;
  status?: string;
}): Promise<{ reference: string; id: string }> {
  const tokenHash =
    opts.tokenHash === undefined
      ? createHash('sha256').update(randomBytes(32)).digest('hex')
      : opts.tokenHash;
  const pickupFar = new Date(Date.now() + 48 * 3600_000);
  const inserted = await opts.pool.query<{ reference: string; id: string }>(
    `insert into public.bookings (
       booking_type, class_id, from_zone_id, to_zone_id,
       pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
       passengers, luggage, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, payment_status, cancel_token_hash
     )
     select 'transfer', c.id, za.id, zb.id,
            'Airport', 'Centre', $1::timestamptz, 45,
            public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
            2, 2, 'Ada', $2, '+30 1',
            7000, 7000, $3::public.booking_status, 'paid', $4
       from public.vehicle_classes c
       join public.zones za on za.code = 'demo-airport'
       join public.zones zb on zb.code = 'demo-centre'
      where c.key = 'demo-e-class'
     returning reference, id`,
    [pickupFar.toISOString(), opts.email, opts.status ?? 'confirmed', tokenHash],
  );
  return inserted.rows[0];
}

describe.skipIf(!hasDatabaseUrl)('booking lookup (prompt 25)', () => {
  let db: TestDb;
  let emails: SendEmailInput[];
  let logLines: string[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  const ip = '203.0.113.77';

  beforeEach(async () => {
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    emails = [];
    logLines = [];
    setTurnstileVerifier(async () => true);
    setEmailTransport(async (input) => {
      emails.push(input);
      return { ok: true, status: 200 };
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      logLines.push(String(msg));
    });
    infoSpy = vi.spyOn(console, 'info').mockImplementation((msg?: unknown) => {
      logLines.push(String(msg));
    });
  });

  afterEach(async () => {
    setBookingDb(null);
    setEmailTransport(null);
    resetTurnstileVerifier();
    clearSettingsCache();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
    await db?.drop();
  });

  it('AC-35: matching and non-matching lookups return the same body; match rotates token and emails once', async () => {
    const oldToken = randomBytes(32).toString('base64url');
    const oldHash = hashCancelToken(oldToken);
    const { reference } = await insertConfirmed({
      pool: db.pool,
      email: 'Ada@Example.com',
      tokenHash: oldHash,
    });

    const miss = await lookupBooking(
      { reference, email: 'nobody@example.com', turnstileToken: 'ok' },
      ip,
    );
    expect(miss).toEqual({ ok: true });
    expect(emails).toHaveLength(0);

    const hit = await lookupBooking(
      { reference: reference.toLowerCase(), email: 'ada@example.com', turnstileToken: 'ok' },
      '203.0.113.78',
    );
    expect(hit).toEqual({ ok: true });
    expect(emails).toHaveLength(1);
    expect(emails[0]?.tag).toBe('manage_link');
    expect(emails[0]?.text).toMatch(/booking\/manage\//);
    expect(emails[0]?.to).toBe('Ada@Example.com');

    const { rows } = await db.pool.query<{ cancel_token_hash: string | null }>(
      `select cancel_token_hash from public.bookings where reference = $1`,
      [reference],
    );
    expect(rows[0]?.cancel_token_hash).not.toBe(oldHash);
    expect(rows[0]?.cancel_token_hash).toBeTruthy();

    expect(await managePageView(oldToken)).toEqual({ kind: 'invalid' });
    const m = emails[0]?.text?.match(/\/booking\/manage\/([A-Za-z0-9_-]+)/);
    expect(m?.[1]).toBeTruthy();
    expect((await managePageView(m![1]!)).kind).toBe('ok');

    const joined = logLines.join('\n');
    expect(joined).not.toMatch(/ada@example\.com/i);
    expect(joined).not.toMatch(new RegExp(reference, 'i'));
  });

  it('AC-35: bad Turnstile → 400; 6th lookup from one IP in an hour → 429', async () => {
    setTurnstileVerifier(async () => false);
    await expect(
      lookupBooking(
        { reference: 'EP-AAAAAA', email: 'a@example.com', turnstileToken: 'bad' },
        ip,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    setTurnstileVerifier(async () => true);
    // Distinct references so the per-reference limit (3/h) does not fire before the IP limit (5/h).
    const refs = ['EP-AAAAAA', 'EP-AAAAAB', 'EP-AAAAAC', 'EP-AAAAAD', 'EP-AAAAAE', 'EP-AAAAAF'];
    for (let i = 0; i < 5; i++) {
      const r = await lookupBooking(
        { reference: refs[i]!, email: 'r@example.com', turnstileToken: 'ok' },
        ip,
      );
      expect(r).toEqual({ ok: true });
    }
    await expect(
      lookupBooking({ reference: refs[5]!, email: 'r@example.com', turnstileToken: 'ok' }, ip),
    ).rejects.toMatchObject({ message: 'rate_limit' });
  });
});
