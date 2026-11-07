// 0029 flight tracking (B7)
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

async function seedBooking(over = {}) {
  const a = await one(`select id from zones where code = 'demo-airport'`);
  const b = await one(`select id from zones where code = 'demo-centre'`);
  const cls = await one(`select id, buffer_minutes from vehicle_classes where key = 'demo-e-class'`);
  const veh = await one(
    `select id from vehicles where class_id = $1 and status = 'active' order by label limit 1`,
    [cls.id],
  );
  const pickup = over.pickup || '2027-12-01T18:00:00+03:00';
  const duration = over.duration || 45;
  const row = await one(
    `insert into bookings (
       booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, blocked_range, flight_number
     ) values (
       'transfer', $1, $2, $3, $4, 'A', 'B', $5::timestamptz, $6, 1,
       'F', $7, '+30', 7000, 7000, 'confirmed',
       public.blocked_range_for($5::timestamptz, $6::int, $8::int),
       'A3 603'
     ) returning id, pickup_at, original_pickup_at, pickup_shift_min, vehicle_id, blocked_range`,
    [
      cls.id,
      over.noVehicle ? null : veh.id,
      a.id,
      b.id,
      pickup,
      duration,
      over.email || `f-${randomUUID().slice(0, 8)}@example.com`,
      cls.buffer_minutes,
    ],
  );
  return { ...row, cls, veh, a, b };
}

test('B7 shift_pickup moves hold and keeps original_pickup_at', async () => {
  const b = await seedBooking();
  const next = '2027-12-01T19:10:00+03:00';
  const r = await one(`select public.shift_pickup($1::uuid, $2::timestamptz, 'delay') as j`, [
    b.id,
    next,
  ]);
  assert.equal(r.j.ok, true);
  assert.equal(r.j.shift_min, 70);
  const row = await one(
    `select pickup_at, original_pickup_at, pickup_shift_min from bookings where id = $1`,
    [b.id],
  );
  assert.equal(new Date(row.original_pickup_at).toISOString(), new Date(b.pickup_at).toISOString());
  assert.equal(new Date(row.pickup_at).toISOString(), new Date(next).toISOString());
  assert.equal(row.pickup_shift_min, 70);
  const ev = await one(
    `select kind, note from booking_events where booking_id = $1 and kind = 'pickup_shifted'`,
    [b.id],
  );
  assert.ok(ev);
  assert.match(ev.note, /18:00 → 19:10|delay/i);
});

test('B7 shift_pickup refuses on vehicle clash', async () => {
  const first = await seedBooking({ pickup: '2027-12-02T18:00:00+03:00' });
  const second = await seedBooking({
    pickup: '2027-12-02T16:00:00+03:00',
    email: `g-${randomUUID().slice(0, 8)}@example.com`,
  });
  // Force same vehicle
  await q(`update bookings set vehicle_id = $1 where id = $2`, [first.vehicle_id, second.id]);
  // Shift second into first's window
  const r = await one(`select public.shift_pickup($1::uuid, $2::timestamptz, 'clash') as j`, [
    second.id,
    '2027-12-02T18:00:00+03:00',
  ]);
  assert.equal(r.j.ok, false);
  assert.equal(r.j.reason, 'conflict');
  const still = await one(`select pickup_at, original_pickup_at from bookings where id = $1`, [
    second.id,
  ]);
  assert.equal(still.original_pickup_at, null);
  assert.equal(new Date(still.pickup_at).toISOString(), new Date(second.pickup_at).toISOString());
});

test('B7 flight_events + settings seeds exist', async () => {
  const b = await seedBooking({ pickup: '2027-12-03T12:00:00+03:00' });
  await q(
    `insert into flight_events (booking_id, status, eta, raw, source)
     values ($1, 'delayed', now(), '{"n":1}'::jsonb, 'aerodatabox')`,
    [b.id],
  );
  const n = await one(`select count(*)::int as n from flight_events where booking_id = $1`, [b.id]);
  assert.equal(n.n, 1);
  const cap = await one(`select value from settings where key = 'flight_daily_call_cap'`);
  assert.equal(Number(cap.value), 200);
});
