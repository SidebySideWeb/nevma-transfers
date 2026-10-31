import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db;
let bookingId;
const staffId = '00000000-0000-4000-8000-000000000001';
const strangerId = '00000000-0000-4000-8000-000000000002';

before(async () => {
  db = await createTestDb();
  const q = (s, p) => db.pool.query(s, p).then((r) => r.rows[0]);
  const c = await q(`insert into vehicle_classes (key, name, max_passengers, max_luggage) values ('sedan', 'Sedan', 3, 3) returning id`);
  const v = await q(`insert into vehicles (class_id, label) values ($1, 's1') returning id`, [c.id]);
  const a = await q(`insert into zones (code, name) values ('a', 'A') returning id`);
  const b = await q(`insert into zones (code, name) values ('b', 'B') returning id`);
  await q(`insert into zone_routes values ($1, $2, 30)`, [a.id, b.id]);
  await q(`insert into zone_prices (from_zone_id, to_zone_id, class_id, price_cents) values ($1, $2, $3, 5000)`, [a.id, b.id, c.id]);
  const bk = await q(`insert into bookings (booking_type, class_id, from_zone_id, to_zone_id, pickup_address, dropoff_address, pickup_at,
      duration_minutes, blocked_range, passengers, customer_name, customer_email, customer_phone, base_price_cents, price_cents, status)
    values ('transfer', $1, $2, $3, 'x', 'y', '2026-12-01T10:00:00+02:00', 30, blocked_range_for('2026-12-01T10:00:00+02:00', 30, 30),
      1, 'C', 'c@example.com', '+30', 5000, 5000, 'confirmed') returning id`, [c.id, a.id, b.id]);
  bookingId = bk.id;
  await q(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
  globalThis.__vehicle = v.id;
});
after(async () => db && db.drop());

const tables = ['vehicle_classes', 'vehicles', 'zones', 'zone_routes', 'zone_prices', 'hourly_rates', 'extras',
  'blocked_slots', 'bookings', 'booking_extras', 'payments', 'settings', 'staff', 'slot_holds'];

test('AC-10 anon can read nothing', async () => {
  for (const t of tables) {
    await asRole(db.pool, 'anon', null, async (c) => {
      await assert.rejects(c.query(`select * from ${t}`), (e) => e.code === '42501', `anon read ${t}`);
    });
  }
});

test('AC-10 a signed-in user who is not staff sees no rows', async () => {
  for (const t of tables) {
    const n = await asRole(db.pool, 'authenticated', strangerId, async (c) => (await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
    assert.equal(n, 0, `stranger sees ${t}`);
  }
});

test('AC-10 staff can read bookings and edit allowed booking columns and prices', async () => {
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    assert.equal((await c.query(`select count(*)::int n from bookings`)).rows[0].n, 1);
    await c.query(`update bookings set security_notes = 'Two agents', invoice_status = 'requested' where id = $1`, [bookingId]);
    await c.query(`update bookings set vehicle_id = $2, status = 'assigned' where id = $1`, [bookingId, globalThis.__vehicle]);
    await c.query(`update zone_prices set price_cents = 5500`);
    await c.query(`update settings set value = '180' where key = 'min_lead_minutes'`);
  });
});

test('AC-10 staff cannot change prices, customer data or payments on a booking', async () => {
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await assert.rejects(c.query(`update bookings set price_cents = 1 where id = $1`, [bookingId]), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await assert.rejects(c.query(`update bookings set customer_email = 'x@y.z' where id = $1`, [bookingId]), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await assert.rejects(c.query(`insert into payments (booking_id, kind, status, amount_cents) values ($1, 'refund', 'pending', 100)`, [bookingId]), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await assert.rejects(c.query(`delete from bookings where id = $1`, [bookingId]), (e) => e.code === '42501');
  });
});

test('AC-10 staff cannot cancel directly; cancellation goes through the web API', async () => {
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await assert.rejects(c.query(`update bookings set status = 'cancelled' where id = $1`, [bookingId]), (e) => e.code === '42501' && /staff_status_change_not_allowed/.test(e.message));
  });
});

test('AC-10 the service role (web API) bypasses RLS', async () => {
  const n = await asRole(db.pool, 'service_role', null, async (c) => (await c.query(`select count(*)::int n from bookings`)).rows[0].n);
  assert.equal(n, 1);
});
