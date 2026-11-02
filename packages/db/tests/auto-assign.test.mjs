// 0018: automatic vehicle assignment when a class has exactly one active vehicle.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db, f;
const staffId = '00000000-0000-4000-8000-0000000000aa';
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];

before(async () => {
  db = await createTestDb();
  const solo = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes) values ('solo', 'Solo', 3, 2, 30) returning id`);
  const duo = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes) values ('duo', 'Duo', 7, 7, 30) returning id`);
  const mixed = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes) values ('mixed', 'Mixed', 7, 7, 30) returning id`);
  const s1 = await one(`insert into vehicles (class_id, label) values ($1, 'SOLO-1') returning id`, [solo.id]);
  const d1 = await one(`insert into vehicles (class_id, label) values ($1, 'DUO-1') returning id`, [duo.id]);
  await q(`insert into vehicles (class_id, label) values ($1, 'DUO-2')`, [duo.id]);
  const m1 = await one(`insert into vehicles (class_id, label) values ($1, 'MIX-1') returning id`, [mixed.id]);
  await q(`insert into vehicles (class_id, label, status) values ($1, 'MIX-2', 'maintenance')`, [mixed.id]);
  const a = await one(`insert into zones (code, name) values ('a', 'A') returning id`);
  const b = await one(`insert into zones (code, name) values ('b', 'B') returning id`);
  await q(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
  f = { solo: solo.id, duo: duo.id, mixed: mixed.id, s1: s1.id, d1: d1.id, m1: m1.id, a: a.id, b: b.id };
});
after(async () => db && db.drop());

let day = 0;
function booking(o = {}) {
  day += 1;
  const pickup = o.pickup_at ?? `2027-01-${String(day).padStart(2, '0')}T10:00:00+02:00`;
  const bk = { booking_type: 'transfer', class_id: f.solo, from_zone_id: f.a, to_zone_id: f.b, pickup_address: 'x', dropoff_address: 'y',
    pickup_at: pickup, duration_minutes: 45, passengers: 2, customer_name: 'C', customer_email: 'c@example.com', customer_phone: '+30',
    base_price_cents: 9000, price_cents: 9000, list_price_cents: 9000, status: 'confirmed', payment_status: 'paid',
    source: 'office', created_by: staffId, payment_method: 'cash', ...o, pickup_at: pickup };
  const cols = Object.keys(bk);
  return one(`insert into bookings (${cols.join(',')}, blocked_range) values (${cols.map((_, i) => '$' + (i + 1)).join(',')},
    blocked_range_for($${cols.indexOf('pickup_at') + 1}::timestamptz, $${cols.indexOf('duration_minutes') + 1}::int, 30)) returning *`, Object.values(bk));
}
const pending = (o = {}) => booking({ status: 'pending', payment_status: 'unpaid', hold_expires_at: new Date(Date.now() + 15 * 60e3).toISOString(), ...o });

test('a confirmed booking in a one-vehicle class gets that vehicle, marked as automatic, and stays confirmed', async () => {
  const bk = await booking();
  assert.equal(bk.vehicle_id, f.s1);
  assert.equal(bk.vehicle_auto_assigned, true);
  assert.equal(bk.status, 'confirmed');
});

test('an online booking gets the vehicle when its payment confirms it (pending -> confirmed), not before', async () => {
  const bk = await pending();
  assert.equal(bk.vehicle_id, null);
  const done = await one(`update bookings set status = 'confirmed', payment_status = 'paid', hold_expires_at = null where id = $1 returning *`, [bk.id]);
  assert.equal(done.vehicle_id, f.s1);
  assert.equal(done.vehicle_auto_assigned, true);
});

test('a late payment (expired -> confirmed, vehicle still free) also gets the vehicle', async () => {
  const bk = await pending();
  await q(`update bookings set status = 'expired' where id = $1`, [bk.id]);
  const done = await one(`update bookings set status = 'confirmed', payment_status = 'paid' where id = $1 returning *`, [bk.id]);
  assert.equal(done.vehicle_id, f.s1);
});

test('classes with two active vehicles are left for the office', async () => {
  const bk = await booking({ class_id: f.duo });
  assert.equal(bk.vehicle_id, null);
  assert.equal(bk.vehicle_auto_assigned, false);
});

test('only active vehicles count: one active + one in maintenance is a one-vehicle class', async () => {
  const bk = await booking({ class_id: f.mixed });
  assert.equal(bk.vehicle_id, f.m1);
});

test('a vehicle that is blocked or already busy at that time is not assigned, and the booking is still saved', async () => {
  const pickup = '2027-02-10T10:00:00+02:00';
  await q(`insert into blocked_slots (vehicle_id, range, reason) values ($1, tstzrange('2027-02-10T09:00:00+02:00', '2027-02-10T12:00:00+02:00'), 'Service')`, [f.s1]);
  const bk = await booking({ pickup_at: pickup });
  assert.equal(bk.vehicle_id, null);
  const first = await booking({ pickup_at: '2027-02-11T10:00:00+02:00' });
  assert.equal(first.vehicle_id, f.s1);
  const second = await booking({ pickup_at: '2027-02-11T10:15:00+02:00' }); // overlaps the first
  assert.equal(second.vehicle_id, null);
});

test('staff changes win: removing the vehicle is not undone, and changing it clears the Auto mark', async () => {
  const bk = await booking();
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    const un = (await c.query(`update bookings set vehicle_id = null where id = $1 returning *`, [bk.id])).rows[0];
    assert.equal(un.vehicle_id, null);
    assert.equal(un.vehicle_auto_assigned, false);
    const back = (await c.query(`update bookings set vehicle_id = $2 where id = $1 returning *`, [bk.id, f.s1])).rows[0];
    assert.equal(back.vehicle_auto_assigned, false, 'set by staff, so not Auto');
    const st = (await c.query(`update bookings set status = 'assigned' where id = $1 returning *`, [bk.id])).rows[0];
    assert.equal(st.vehicle_id, f.s1);
  });
});

test('assigned -> confirmed (office takes a booking back) never re-assigns', async () => {
  const bk = await booking({ class_id: f.duo });
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await c.query(`update bookings set vehicle_id = $2, status = 'assigned' where id = $1`, [bk.id, f.d1]);
    const back = (await c.query(`update bookings set vehicle_id = null, status = 'confirmed' where id = $1 returning *`, [bk.id])).rows[0];
    assert.equal(back.vehicle_id, null);
  });
});

test('the switch in settings turns the rule off', async () => {
  await q(`update settings set value = 'false' where key = 'auto_assign_single_vehicle'`);
  const bk = await booking();
  assert.equal(bk.vehicle_id, null);
  await q(`update settings set value = 'true' where key = 'auto_assign_single_vehicle'`);
});

test('backfill assigns waiting future bookings once a class is down to one vehicle; staff only', async () => {
  const bk = await booking({ class_id: f.duo, pickup_at: '2027-03-01T10:00:00+02:00' });
  assert.equal(bk.vehicle_id, null);
  await q(`update vehicles set status = 'retired' where class_id = $1 and id <> $2`, [f.duo, f.d1]);
  await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000bb', async (c) => {
    await assert.rejects(c.query(`select auto_assign_backfill($1)`, [f.duo]), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'anon', null, async (c) => {
    await assert.rejects(c.query(`select auto_assign_backfill($1)`, [f.duo]), (e) => e.code === '42501');
  });
  const n = (await one(`select auto_assign_backfill($1) as n`, [f.duo])).n;
  assert.ok(n >= 1);
  const after = await one(`select vehicle_id, vehicle_auto_assigned from bookings where id = $1`, [bk.id]);
  assert.equal(after.vehicle_id, f.d1);
  assert.equal(after.vehicle_auto_assigned, true);
});
