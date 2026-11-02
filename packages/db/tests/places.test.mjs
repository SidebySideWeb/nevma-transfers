// 0021: Google place data on booking addresses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db, f;
const staffId = '00000000-0000-4000-8000-0000000000aa';
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const PLACE = 'ChIJ8UNwBh-9oRQR3Y1mdkU1Nic'; // shape of a real Google place ID

before(async () => {
  db = await createTestDb();
  const cls = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes) values ('van', 'Van', 7, 7, 30) returning id`);
  await q(`insert into vehicles (class_id, label) values ($1, 'VAN-1'), ($1, 'VAN-2')`, [cls.id]);
  const a = await one(`insert into zones (code, name) values ('a', 'A') returning id`);
  const b = await one(`insert into zones (code, name) values ('b', 'B') returning id`);
  await q(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
  f = { classId: cls.id, a: a.id, b: b.id };
});
after(async () => db && db.drop());

let n = 0;
function booking(o = {}) {
  n += 1;
  const bk = { booking_type: 'transfer', class_id: f.classId, from_zone_id: f.a, to_zone_id: f.b, pickup_address: 'Hilton Athens', dropoff_address: 'Piraeus port',
    pickup_at: `2027-04-${String(n).padStart(2, '0')}T10:00:00+03:00`, duration_minutes: 45, passengers: 2, customer_name: 'C', customer_email: 'c@example.com',
    customer_phone: '+30', base_price_cents: 9000, price_cents: 9000, status: 'pending', ...o };
  const cols = Object.keys(bk);
  return one(`insert into bookings (${cols.join(',')}, blocked_range) values (${cols.map((_, i) => '$' + (i + 1)).join(',')},
    blocked_range_for($${cols.indexOf('pickup_at') + 1}::timestamptz, $${cols.indexOf('duration_minutes') + 1}::int, 30)) returning *`, Object.values(bk));
}
const pick = { pickup_place_id: PLACE, pickup_lat: 37.9767, pickup_lng: 23.7503 };
const drop = { dropoff_place_id: 'ChIJ_bVq3Sy8oRQRuS9oK3Gd9sk', dropoff_lat: 37.9420, dropoff_lng: 23.6465 };

test('typed addresses without place data are still valid', async () => {
  const bk = await booking();
  assert.equal(bk.pickup_place_id, null);
});

test('a picked pickup and drop-off keep place ID and coordinates', async () => {
  const bk = await booking({ ...pick, ...drop });
  assert.equal(bk.pickup_place_id, PLACE);
  assert.equal(bk.dropoff_lat, 37.942);
});

test('place data is all or nothing', async () => {
  await assert.rejects(booking({ pickup_place_id: PLACE }), (e) => e.code === '23514');
  await assert.rejects(booking({ pickup_lat: 37.9, pickup_lng: 23.7 }), (e) => e.code === '23514');
  await assert.rejects(booking({ dropoff_place_id: PLACE, dropoff_lat: 37.9 }), (e) => e.code === '23514');
});

test('coordinates outside Greece and malformed place IDs are refused', async () => {
  await assert.rejects(booking({ ...pick, pickup_lat: 48.85, pickup_lng: 2.35 }), (e) => e.code === '23514'); // Paris
  await assert.rejects(booking({ ...pick, pickup_place_id: 'x' }), (e) => e.code === '23514');
  await assert.rejects(booking({ ...pick, pickup_place_id: "abc'; drop table bookings;--" }), (e) => e.code === '23514');
});

test('an hourly booking (no drop-off address) cannot carry a drop-off place', async () => {
  await assert.rejects(booking({ booking_type: 'hourly', to_zone_id: null, dropoff_address: null, hours: 4, duration_minutes: 240, ...drop }), (e) => e.code === '23514');
  const ok = await booking({ booking_type: 'hourly', to_zone_id: null, dropoff_address: null, hours: 4, duration_minutes: 240, ...pick });
  assert.equal(ok.pickup_place_id, PLACE);
});

test('staff can read place data but cannot change it directly', async () => {
  const bk = await booking({ ...pick });
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    const r = (await c.query(`select pickup_place_id from bookings where id = $1`, [bk.id])).rows[0];
    assert.equal(r.pickup_place_id, PLACE);
    await assert.rejects(c.query(`update bookings set pickup_lat = 38 where id = $1`, [bk.id]), (e) => e.code === '42501');
  });
});
