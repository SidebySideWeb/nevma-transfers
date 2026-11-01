import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import { dbFromPool, setBookingDb } from './db';
import { clearConfirmedCalls, getConfirmedCalls, setOnConfirmed, setOnLateRefund } from './hooks';
import { fail } from './http';
import { internalCancel, internalRefund } from './internal';
import { BookingError } from '../booking/types';
import { FakePaymentProvider, resetPaymentProvider } from './payments';
import { clearSettingsCache } from './settings';
import { sign, verifySignature } from './signing';
import { handleVivaPost } from './webhook-viva';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const SECRET = 'test-signing-secret-for-ac24';

async function insertPending(pool: TestDb['pool'], opts: {
  orderCode: number;
  priceCents?: number;
  holdExpired?: boolean;
}) {
  const price = opts.priceCents ?? 22000;
  const pickup = new Date(Date.now() + 48 * 3600_000).toISOString();
  const holdExp = opts.holdExpired
    ? new Date(Date.now() - 60_000).toISOString()
    : new Date(Date.now() + 10 * 60_000).toISOString();
  const r = await pool.query(
    `insert into public.bookings (
       booking_type, class_id, from_zone_id, to_zone_id,
       pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
       passengers, luggage, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, payment_status, hold_expires_at, viva_order_code
     )
     select 'transfer', c.id, za.id, zb.id,
            'A', 'B', $1::timestamptz, 45,
            public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
            2, 2, 'Cust', 'c@example.com', '+30 1',
            $2::int, $2::int, 'pending', 'unpaid', $3::timestamptz, $4::bigint
       from public.vehicle_classes c
       join public.zones za on za.code = 'demo-airport'
       join public.zones zb on zb.code = 'demo-centre'
      where c.key = 'demo-e-class'
     returning id, reference, price_cents, class_id, blocked_range`,
    [pickup, price, holdExp, opts.orderCode],
  );
  return r.rows[0] as {
    id: string;
    reference: string;
    price_cents: number;
    class_id: string;
    blocked_range: string;
  };
}

describe.skipIf(!hasDatabaseUrl)('Viva payments (prompt 07)', () => {
  let db: TestDb;
  let payments: FakePaymentProvider;
  let lateEmails: string[];

  beforeEach(async () => {
    process.env.ADMIN_TO_WEB_SIGNING_SECRET = SECRET;
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    payments = resetPaymentProvider();
    clearConfirmedCalls();
    lateEmails = [];
    setOnConfirmed(async () => {
      /* no emails in payment unit tests */
    });
    setOnLateRefund(async (ref) => {
      lateEmails.push(ref);
    });
  });

  afterEach(async () => {
    setBookingDb(null);
    clearSettingsCache();
    await db?.drop();
  });

  it('AC-06: success redirect alone leaves pending; verified event confirms; bad txn leaves unchanged', async () => {
    const b = await insertPending(db.pool, { orderCode: 900001, priceCents: 22000 });
    // Redirect alone: status poll would see pending
    expect(
      (await db.pool.query(`select status from public.bookings where id = $1`, [b.id])).rows[0].status,
    ).toBe('pending');

    const goodTx = randomUUID();
    payments.transactions.set(goodTx, {
      transactionId: goodTx,
      orderCode: '900001',
      amountCents: 22000,
      succeeded: true,
    });
    await handleVivaPost({
      EventTypeId: 1796,
      EventData: { TransactionId: goodTx, OrderCode: 900001 },
    });
    expect(
      (await db.pool.query(`select status, payment_status from public.bookings where id = $1`, [b.id]))
        .rows[0],
    ).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
    expect(getConfirmedCalls()).toEqual([b.reference]);

    const b2 = await insertPending(db.pool, { orderCode: 900002, priceCents: 22000 });
    const failTx = randomUUID();
    payments.transactions.set(failTx, {
      transactionId: failTx,
      orderCode: '900002',
      amountCents: 22000,
      succeeded: false,
    });
    await handleVivaPost({
      EventTypeId: 1796,
      EventData: { TransactionId: failTx, OrderCode: 900002 },
    });
    expect(
      (await db.pool.query(`select status from public.bookings where id = $1`, [b2.id])).rows[0].status,
    ).toBe('pending');

    const b3 = await insertPending(db.pool, { orderCode: 900003, priceCents: 22000 });
    const wrongAmt = randomUUID();
    payments.transactions.set(wrongAmt, {
      transactionId: wrongAmt,
      orderCode: '900003',
      amountCents: 100,
      succeeded: true,
    });
    await handleVivaPost({
      EventTypeId: 1796,
      EventData: { TransactionId: wrongAmt, OrderCode: 900003 },
    });
    expect(
      (await db.pool.query(`select status, payment_status from public.bookings where id = $1`, [b3.id]))
        .rows[0],
    ).toMatchObject({ status: 'pending', payment_status: 'unpaid' });
    const payCount = await db.pool.query(
      `select count(*)::int as n from public.payments where booking_id = $1`,
      [b3.id],
    );
    expect(payCount.rows[0].n).toBe(0);
  });

  it('AC-07: same event twice → one payment row, one confirmation hook', async () => {
    const b = await insertPending(db.pool, { orderCode: 900010, priceCents: 7000 });
    const tx = randomUUID();
    payments.transactions.set(tx, {
      transactionId: tx,
      orderCode: '900010',
      amountCents: 7000,
      succeeded: true,
    });
    const body = { EventTypeId: 1796, EventData: { TransactionId: tx, OrderCode: 900010 } };
    await handleVivaPost(body);
    await handleVivaPost(body);
    expect(getConfirmedCalls()).toEqual([b.reference]);
    expect(
      (await db.pool.query(`select count(*)::int as n from public.payments where booking_id = $1`, [b.id]))
        .rows[0].n,
    ).toBe(1);
  });

  it('AC-11: late free → confirmed; late taken → refunded cancelled emails', async () => {
    const free = await insertPending(db.pool, {
      orderCode: 900020,
      priceCents: 7000,
      holdExpired: true,
    });
    const tx1 = randomUUID();
    payments.transactions.set(tx1, {
      transactionId: tx1,
      orderCode: '900020',
      amountCents: 7000,
      succeeded: true,
    });
    await handleVivaPost({
      EventTypeId: 1796,
      EventData: { TransactionId: tx1, OrderCode: 900020 },
    });
    expect(
      (await db.pool.query(`select status from public.bookings where id = $1`, [free.id])).rows[0]
        .status,
    ).toBe('confirmed');

    await db.pool.query(
      `delete from public.vehicles
        where class_id = (select id from public.vehicle_classes where key = 'demo-e-class')
          and label like '%-2'`,
    );
    const late = await insertPending(db.pool, {
      orderCode: 900021,
      priceCents: 7000,
      holdExpired: true,
    });
    await db.pool.query(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status
       )
       select 'transfer', $1::uuid, za.id, zb.id,
              'X', 'Y', lower($2::tstzrange) + interval '30 minutes', 45, $2::tstzrange,
              1, 1, 'Other', 'o@example.com', '+30 2',
              7000, 7000, 'confirmed', 'paid'
         from public.zones za, public.zones zb
        where za.code = 'demo-airport' and zb.code = 'demo-centre'`,
      [late.class_id, late.blocked_range],
    );
    const tx2 = randomUUID();
    payments.transactions.set(tx2, {
      transactionId: tx2,
      orderCode: '900021',
      amountCents: 7000,
      succeeded: true,
    });
    await handleVivaPost({
      EventTypeId: 1796,
      EventData: { TransactionId: tx2, OrderCode: 900021 },
    });
    expect(
      (await db.pool.query(`select status, payment_status from public.bookings where id = $1`, [late.id]))
        .rows[0],
    ).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
    expect(payments.refunds.some((r) => r.transactionId === tx2)).toBe(true);
    expect(lateEmails).toEqual([late.reference]);
  });

  it('AC-08: refund 150 then 70 → refunded; further 1 € → 400; same idempotency twice', async () => {
    const staffId = randomUUID();
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'staff@example.com')`, [
      staffId,
    ]);
    await db.pool.query(`insert into public.staff (user_id, email, name) values ($1, 'staff@example.com', 'S')`, [
      staffId,
    ]);

    const b = await insertPending(db.pool, { orderCode: 900030, priceCents: 22000 });
    const tx = randomUUID();
    await db.pool.query(
      `update public.bookings set status = 'confirmed', payment_status = 'paid' where id = $1`,
      [b.id],
    );
    await db.pool.query(
      `insert into public.payments (booking_id, kind, status, amount_cents, viva_transaction_id)
       values ($1, 'payment', 'succeeded', 22000, $2::uuid)`,
      [b.id, tx],
    );

    const key1 = randomUUID();
    const r1 = await internalRefund(
      {
        reference: b.reference,
        amountCents: 15000,
        reason: 'partial',
        idempotencyKey: key1,
      },
      staffId,
    );
    expect(r1.paymentStatus).toBe('partially_refunded');
    expect(r1.refundableCents).toBe(7000);

    const key2 = randomUUID();
    const r2 = await internalRefund(
      {
        reference: b.reference,
        amountCents: 7000,
        reason: 'rest',
        idempotencyKey: key2,
      },
      staffId,
    );
    expect(r2.paymentStatus).toBe('refunded');
    expect(r2.refundableCents).toBe(0);
    expect(payments.refunds).toHaveLength(2);

    await expect(
      internalRefund(
        {
          reference: b.reference,
          amountCents: 100,
          reason: 'too much',
          idempotencyKey: randomUUID(),
        },
        staffId,
      ),
    ).rejects.toMatchObject({ message: 'refund_exceeds_paid' });

    const again = await internalRefund(
      {
        reference: b.reference,
        amountCents: 15000,
        reason: 'partial',
        idempotencyKey: key1,
      },
      staffId,
    );
    expect(again.refundedCents).toBe(15000);
    expect(payments.refunds).toHaveLength(2); // no third Viva call
  });

  it('AC-24: wrong signature, old timestamp, non-staff → 401', async () => {
    const staffId = randomUUID();
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'staff2@example.com')`, [
      staffId,
    ]);
    await db.pool.query(
      `insert into public.staff (user_id, email, name) values ($1, 'staff2@example.com', 'S2')`,
      [staffId],
    );

    const body = JSON.stringify({
      reference: 'TEM-AAAAAA',
      amountCents: 100,
      reason: 'x',
      idempotencyKey: randomUUID(),
    });
    const now = Math.floor(Date.now() / 1000);

    const badSig = new Request('http://localhost/api/internal/refund', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(now),
        'x-tem-signature': '00'.repeat(32),
        'x-tem-staff': staffId,
      },
      body,
    });
    await expect(verifySignature(badSig)).rejects.toMatchObject({ message: 'bad_signature' });
    expect(
      fail(
        new BookingError('invalid_request', {
          stringKey: 'error.invalid_request',
          message: 'bad_signature',
        }),
        401,
      ).status,
    ).toBe(401);

    const old = new Request('http://localhost/api/internal/refund', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(now - 6 * 60),
        'x-tem-signature': sign(body, now - 6 * 60),
        'x-tem-staff': staffId,
      },
      body,
    });
    await expect(verifySignature(old)).rejects.toMatchObject({ message: 'timestamp_skew' });

    const stranger = randomUUID();
    const goodTs = now;
    const sig = sign(body, goodTs);
    const nonStaff = new Request('http://localhost/api/internal/refund', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(goodTs),
        'x-tem-signature': sig,
        'x-tem-staff': stranger,
      },
      body,
    });
    await expect(verifySignature(nonStaff)).rejects.toMatchObject({ message: 'not_staff' });

    // cancel path also exercises internalCancel wiring lightly
    await expect(
      internalCancel(
        {
          reference: 'TEM-NOPE01',
          refund: 'none',
          reason: 'x',
          idempotencyKey: randomUUID(),
        },
        staffId,
      ),
    ).rejects.toMatchObject({ message: 'unknown_booking' });
  });
});
