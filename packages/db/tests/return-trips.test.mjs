// 0028 return trips (B6)
import { randomUUID } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';

let db;
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];

before(async () => {
  db = await createTestDb({ seed: true });
});
after(async () => db && db.drop());

async function seedPair() {
  const a = await one(`select id from zones where code = 'demo-airport'`);
  const b = await one(`select id from zones where code = 'demo-centre'`);
  const cls = await one(`select id, buffer_minutes from vehicle_classes where key = 'demo-e-class'`);
  const veh = await one(
    `select id from vehicles where class_id = $1 and status = 'active' limit 1`,
    [cls.id],
  );
  return { a, b, cls, veh };
}

test('B6: return before outbound ends is rejected', async () => {
  const { a, b, cls, veh } = await seedPair();
  const group = randomUUID();
  const out = await one(
    `insert into bookings (
       booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, blocked_range, trip_group_id, leg
     ) values (
       'transfer', $1, $2, $3, $4, 'A', 'B', '2027-09-01T10:00:00+03:00', 60, 1,
       'R', 'r@example.com', '+30', 7000, 7000, 'confirmed',
       public.blocked_range_for('2027-09-01T10:00:00+03:00'::timestamptz, 60, $5::int),
       $6::uuid, 1
     ) returning id`,
    [cls.id, veh.id, a.id, b.id, cls.buffer_minutes, group],
  );
  await assert.rejects(
    one(
      `insert into bookings (
         booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
         pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, blocked_range, trip_group_id, leg, return_of
       ) values (
         'transfer', $1, $2, $4, $3, 'B', 'A', '2027-09-01T10:30:00+03:00', 60, 1,
         'R', 'r2@example.com', '+30', 6000, 6000, 'confirmed',
         public.blocked_range_for('2027-09-01T10:30:00+03:00'::timestamptz, 60, $5::int),
         $6::uuid, 2, $7::uuid
       ) returning id`,
      [cls.id, veh.id, a.id, b.id, cls.buffer_minutes, group, out.id],
    ),
    (e) => /return pickup before outbound ends/i.test(e.message),
  );
});

test('B6: create_booking_from_quote creates both legs or neither', async () => {
  const quote = await one(
    `insert into quotes (
       mode, pickup_at, duration_min, passengers, luggage, prices, expires_at,
       from_zone_code, to_zone_code, return_pickup_at, return_duration_min
     ) values (
       'transfer', '2027-10-01T10:00:00+03:00', 45, 2, 2,
       jsonb_build_object(
         'demo-e-class', jsonb_build_object(
           'available', true,
           'outbound', 7000,
           'return', 6300,
           'total', 13300,
           'breakdown', '[]'::jsonb,
           'returnBreakdown', '[]'::jsonb
         )
       ),
       now() + interval '20 minutes',
       'demo-airport', 'demo-centre',
       '2027-10-01T18:00:00+03:00', 45
     ) returning id`,
  );
  const j = await one(
    `select public.create_booking_from_quote(
       $1::uuid, 'demo-e-class', 'vid-ret', 'Airport', 'Centre', 2, 2, null, null,
       null::text[], 'Ret Customer', 'ret@example.com', '+306900000001',
       null, null, null, null
     ) as j`,
    [quote.id],
  );
  assert.ok(j.j.return_reference);
  assert.equal(j.j.price_cents, 13300);
  const legs = await q(
    `select reference, leg, price_cents, trip_group_id from bookings
      where trip_group_id = $1::uuid order by leg`,
    [j.j.trip_group_id],
  );
  assert.equal(legs.length, 2);
  assert.equal(legs[0].leg, 1);
  assert.equal(legs[1].leg, 2);
  assert.equal(Number(legs[0].price_cents) + Number(legs[1].price_cents), 13300);
});

test('B6: expire_holds releases both legs of a trip group', async () => {
  const { a, b, cls, veh } = await seedPair();
  const group = randomUUID();
  const out = await one(
    `insert into bookings (
       booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, payment_status, hold_expires_at, blocked_range,
       trip_group_id, leg
     ) values (
       'transfer', $1, $2, $3, $4, 'A', 'B', now() + interval '2 days', 45, 1,
       'E', 'e@example.com', '+30', 5000, 5000, 'pending', 'unpaid', now() - interval '1 minute',
       public.blocked_range_for((now() + interval '2 days')::timestamptz, 45, $5::int),
       $6::uuid, 1
     ) returning id`,
    [cls.id, veh.id, a.id, b.id, cls.buffer_minutes, group],
  );
  await one(
    `insert into bookings (
       booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, payment_status, hold_expires_at, blocked_range,
       trip_group_id, leg, return_of
     ) values (
       'transfer', $1, $2, $4, $3, 'B', 'A', now() + interval '2 days' + interval '3 hours', 45, 1,
       'E', 'e2@example.com', '+30', 4500, 4500, 'pending', 'unpaid', now() + interval '10 minutes',
       public.blocked_range_for((now() + interval '2 days' + interval '3 hours')::timestamptz, 45, $5::int),
       $6::uuid, 2, $7::uuid
     ) returning id`,
    [cls.id, veh.id, a.id, b.id, cls.buffer_minutes, group, out.id],
  );
  await one(`select public.expire_holds()`);
  const statuses = await q(
    `select status from bookings where trip_group_id = $1::uuid order by leg`,
    [group],
  );
  assert.deepEqual(
    statuses.map((s) => s.status),
    ['expired', 'expired'],
  );
});

test('B6: cancelling leg 2 refunds only that share (payment rows)', async () => {
  const { a, b, cls, veh } = await seedPair();
  const group = randomUUID();
  const order = 900000001;
  const out = await one(
    `insert into bookings (
       booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, payment_status, viva_order_code, blocked_range,
       trip_group_id, leg
     ) values (
       'transfer', $1, $2, $3, $4, 'A', 'B', '2027-11-01T10:00:00+03:00', 45, 1,
       'P', 'p@example.com', '+30', 7000, 7000, 'confirmed', 'paid', $6,
       public.blocked_range_for('2027-11-01T10:00:00+03:00'::timestamptz, 45, $5::int),
       $7::uuid, 1
     ) returning id`,
    [cls.id, veh.id, a.id, b.id, cls.buffer_minutes, order, group],
  );
  const ret = await one(
    `insert into bookings (
       booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, payment_status, viva_order_code, blocked_range,
       trip_group_id, leg, return_of
     ) values (
       'transfer', $1, $2, $4, $3, 'B', 'A', '2027-11-01T18:00:00+03:00', 45, 1,
       'P', 'p2@example.com', '+30', 6300, 6300, 'confirmed', 'paid', $6,
       public.blocked_range_for('2027-11-01T18:00:00+03:00'::timestamptz, 45, $5::int),
       $7::uuid, 2, $8::uuid
     ) returning id`,
    [cls.id, veh.id, a.id, b.id, cls.buffer_minutes, order, group, out.id],
  );
  const tx = randomUUID();
  await q(
    `insert into payments (booking_id, kind, status, amount_cents, viva_order_code, viva_transaction_id, trip_group_id)
     values ($1, 'payment', 'succeeded', 7000, $3, $4::uuid, $5::uuid),
            ($2, 'payment', 'succeeded', 6300, $3, $4::uuid, $5::uuid)`,
    [out.id, ret.id, order, tx, group],
  );
  await q(
    `insert into payments (booking_id, kind, status, amount_cents, viva_transaction_id, trip_group_id)
     values ($1, 'refund', 'succeeded', 6300, gen_random_uuid(), $2::uuid)`,
    [ret.id, group],
  );
  await q(
    `update bookings set status = 'cancelled', payment_status = 'refunded', cancelled_at = now()
      where id = $1`,
    [ret.id],
  );
  const still = await one(`select status, payment_status from bookings where id = $1`, [out.id]);
  assert.equal(still.status, 'confirmed');
  assert.equal(still.payment_status, 'paid');
  const refunded = await one(
    `select sum(amount_cents)::int as n from payments where booking_id = $1 and kind = 'refund'`,
    [ret.id],
  );
  assert.equal(refunded.n, 6300);
});
