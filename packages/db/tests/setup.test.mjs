// 0012: fleet and setup management guards (staff add and edit classes, vehicles, zones, extras in the admin).
// Each asStaff call runs in its own transaction that is rolled back, so tests do not depend on each other's changes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db, f;
const staffId = '00000000-0000-4000-8000-0000000000d1';
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const asStaff = (fn) => asRole(db.pool, 'authenticated', staffId, fn);

before(async () => {
  db = await createTestDb();
  await q(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
  const used = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage) values ('sedan', 'Sedan', 3, 2) returning id`);
  const v1 = await one(`insert into vehicles (class_id, label) values ($1, 'SEDAN-1') returning id`, [used.id]);
  const v2 = await one(`insert into vehicles (class_id, label) values ($1, 'SEDAN-2') returning id`, [used.id]);
  const a = await one(`insert into zones (code, name) values ('airport', 'Airport') returning id`);
  const b = await one(`insert into zones (code, name) values ('centre', 'Centre') returning id`);
  await q(`insert into zone_routes values ($1, $2, 45)`, [a.id, b.id]);
  await q(`insert into extras (code, name, price_cents) values ('vip-security', 'VIP security', 15000), ('child-seat', 'Child seat', 0) on conflict (code) do nothing`);
  await q(`insert into bookings (booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address, pickup_at, duration_minutes,
      blocked_range, passengers, customer_name, customer_email, customer_phone, base_price_cents, price_cents, status)
    values ('transfer', $1, $2, $3, $4, 'x', 'y', now() + interval '3 days', 45, tstzrange(now() + interval '3 days' - interval '30 min', now() + interval '3 days 75 min'),
      1, 'C', 'c@example.com', '+30', 7000, 7000, 'assigned')`, [used.id, v1.id, a.id, b.id]);
  f = { used: used.id, v1: v1.id, v2: v2.id, a: a.id, b: b.id };
});
after(async () => db && db.drop());

const inUse = (e) => /in_use|has_future_bookings/.test(e.message);

test('staff can add a class and vehicles, set capacity and switch it online', async () => {
  await asStaff(async (c) => {
    const cls = (await c.query(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes, active) values ('limo', 'Limousine', 3, 2, 60, false) returning id`)).rows[0];
    await c.query(`insert into vehicles (class_id, label, note) values ($1, 'LIMO-1', 'Mercedes · black'), ($1, 'LIMO-2', null)`, [cls.id]);
    await c.query(`update vehicle_classes set key = 'limousine' where id = $1`, [cls.id]).catch(() => {});
  });
  await asStaff(async (c) => {
    const cls = (await c.query(`insert into vehicle_classes (key, name, max_passengers, max_luggage) values ('minibus', 'Minibus', 16, 16) returning id`)).rows[0];
    await c.query(`update vehicle_classes set key = 'mini-bus', max_passengers = 15, active = true where id = $1`, [cls.id]); // unused: key may change
  });
});

test('a class key or zone code in use cannot change; unused ones can', async () => {
  await asStaff(async (c) => { await assert.rejects(c.query(`update vehicle_classes set key = 'exec' where id = $1`, [f.used]), inUse); });
  await asStaff(async (c) => { await assert.rejects(c.query(`update zones set code = 'ath' where id = $1`, [f.a]), inUse); });
  await asStaff(async (c) => {
    const z = (await c.query(`insert into zones (code, name) values ('north', 'North') returning id`)).rows[0];
    await c.query(`update zones set code = 'north-suburbs', name = 'North suburbs' where id = $1`, [z.id]);
  });
});

test('classes, vehicles and zones with history are switched off, not deleted', async () => {
  await asStaff(async (c) => { await assert.rejects(c.query(`delete from vehicle_classes where id = $1`, [f.used]), inUse); });
  await asStaff(async (c) => { await assert.rejects(c.query(`delete from vehicles where id = $1`, [f.v1]), inUse); });
  await asStaff(async (c) => { await assert.rejects(c.query(`delete from zones where id = $1`, [f.a]), inUse); });
  await asStaff(async (c) => { await c.query(`update vehicle_classes set active = false where id = $1`, [f.used]); });
  await asStaff(async (c) => { await c.query(`delete from vehicles where id = $1`, [f.v2]); });  // no bookings: may go
});

test('a vehicle with future bookings cannot go to maintenance, retire or change class', async () => {
  await asStaff(async (c) => { await assert.rejects(c.query(`update vehicles set status = 'maintenance' where id = $1`, [f.v1]), /has_future_bookings: SEDAN-1 has 1/); });
  const other = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage) values ('suv', 'SUV', 4, 4) returning id`);
  await asStaff(async (c) => { await assert.rejects(c.query(`update vehicles set class_id = $2 where id = $1`, [f.v1, other.id]), /has_future_bookings/); });
  await asStaff(async (c) => { await c.query(`update vehicles set label = 'SEDAN-01', note = 'BMW · black · plate' where id = $1`, [f.v1]); });
});

test('vehicle labels are unique; the built-in extras cannot be deleted or renamed', async () => {
  await asStaff(async (c) => { await assert.rejects(c.query(`insert into vehicles (class_id, label) values ($1, 'sedan-1')`, [f.used]), (e) => e.code === '23505'); });
  await asStaff(async (c) => { await assert.rejects(c.query(`delete from extras where code = 'vip-security'`), inUse); });
  await asStaff(async (c) => { await assert.rejects(c.query(`update extras set code = 'security' where code = 'vip-security'`), inUse); });
  await asStaff(async (c) => {
    await c.query(`update extras set price_cents = 16000, active = false where code = 'vip-security'`);
    await c.query(`delete from extras where code = 'child-seat'`);
  });
});

test('people who are not staff cannot change the fleet', async () => {
  await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000d2', async (c) => {
    await assert.rejects(c.query(`insert into vehicles (class_id, label) values ($1, 'X-1')`, [f.used]), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'anon', null, async (c) => {
    await assert.rejects(c.query(`insert into zones (code, name) values ('z', 'Z')`), (e) => e.code === '42501');
  });
});
