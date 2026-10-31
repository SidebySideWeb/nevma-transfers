import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';
import { randomUUID } from 'node:crypto';

async function seedPendingBooking(pool, { holdExpired = false, orderCode = 555001 } = {}) {
  const pickup = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const holdExp = holdExpired
    ? new Date(Date.now() - 60_000).toISOString()
    : new Date(Date.now() + 15 * 60_000).toISOString();
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
            2, 2, 'C', 'c@example.com', '+30 1',
            7000, 7000, 'pending', 'unpaid', $2::timestamptz, $3::bigint
       from public.vehicle_classes c
       join public.zones za on za.code = 'demo-airport'
       join public.zones zb on zb.code = 'demo-centre'
      where c.key = 'demo-sedan'
     returning id, reference, price_cents, class_id, blocked_range`,
    [pickup, holdExp, orderCode],
  );
  return r.rows[0];
}

describe('0008 record_viva_payment', () => {
  it('AC-06 confirmed when hold still live', async () => {
    const db = await createTestDb({ seed: true });
    try {
      const b = await seedPendingBooking(db.pool, { orderCode: 800001 });
      const tx = randomUUID();
      const { rows } = await db.pool.query(
        `select public.record_viva_payment($1::bigint, $2::uuid, $3::int, '{}'::jsonb) as j`,
        [800001, tx, b.price_cents],
      );
      assert.equal(rows[0].j.outcome, 'confirmed');
      const st = await db.pool.query(`select status, payment_status from public.bookings where id = $1`, [
        b.id,
      ]);
      assert.equal(st.rows[0].status, 'confirmed');
      assert.equal(st.rows[0].payment_status, 'paid');
      const n = await db.pool.query(`select count(*)::int as n from public.payments where booking_id = $1`, [
        b.id,
      ]);
      assert.equal(n.rows[0].n, 1);
    } finally {
      await db.drop();
    }
  });

  it('AC-07 duplicate transaction returns duplicate and one payment row', async () => {
    const db = await createTestDb({ seed: true });
    try {
      const b = await seedPendingBooking(db.pool, { orderCode: 800002 });
      const tx = randomUUID();
      const first = await db.pool.query(
        `select public.record_viva_payment($1::bigint, $2::uuid, $3::int) as j`,
        [800002, tx, b.price_cents],
      );
      assert.equal(first.rows[0].j.outcome, 'confirmed');
      const second = await db.pool.query(
        `select public.record_viva_payment($1::bigint, $2::uuid, $3::int) as j`,
        [800002, tx, b.price_cents],
      );
      assert.equal(second.rows[0].j.outcome, 'duplicate');
      const n = await db.pool.query(`select count(*)::int as n from public.payments where booking_id = $1`, [
        b.id,
      ]);
      assert.equal(n.rows[0].n, 1);
    } finally {
      await db.drop();
    }
  });

  it('AC-11 late payment with free vehicle → confirmed', async () => {
    const db = await createTestDb({ seed: true });
    try {
      const b = await seedPendingBooking(db.pool, { holdExpired: true, orderCode: 800003 });
      const { rows } = await db.pool.query(
        `select public.record_viva_payment($1::bigint, $2::uuid, $3::int) as j`,
        [800003, randomUUID(), b.price_cents],
      );
      assert.equal(rows[0].j.outcome, 'confirmed');
      assert.equal(
        (await db.pool.query(`select status from public.bookings where id = $1`, [b.id])).rows[0].status,
        'confirmed',
      );
    } finally {
      await db.drop();
    }
  });

  it('AC-11 late payment with no free vehicle → late_unavailable', async () => {
    const db = await createTestDb({ seed: true });
    try {
      // Only one sedan left; take it with a confirmed booking on the same range.
      await db.pool.query(
        `delete from public.vehicles
          where class_id = (select id from public.vehicle_classes where key = 'demo-sedan')
            and label like '%-2'`,
      );
      const late = await seedPendingBooking(db.pool, { holdExpired: true, orderCode: 800004 });
      // Confirmed booking that occupies the only vehicle (exclude late booking from availability).
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

      const { rows } = await db.pool.query(
        `select public.record_viva_payment($1::bigint, $2::uuid, $3::int) as j`,
        [800004, randomUUID(), late.price_cents],
      );
      assert.equal(rows[0].j.outcome, 'late_unavailable');
      assert.equal(
        (await db.pool.query(`select status, payment_status from public.bookings where id = $1`, [late.id]))
          .rows[0].status,
        'pending',
      );
      assert.equal(
        (await db.pool.query(`select payment_status from public.bookings where id = $1`, [late.id])).rows[0]
          .payment_status,
        'paid',
      );
    } finally {
      await db.drop();
    }
  });
});
