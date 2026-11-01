// 0011: office (manual) bookings, offline payments, office holds, fleet calendar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db, f;
const staffId = '00000000-0000-4000-8000-0000000000aa';
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);

before(async () => {
  db = await createTestDb();
  const one = async (sql, p) => (await q(sql, p))[0];
  const cls = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes) values ('van', 'Van', 7, 7, 30) returning id`);
  const v1 = await one(`insert into vehicles (class_id, label) values ($1, 'VAN-1') returning id`, [cls.id]);
  const v2 = await one(`insert into vehicles (class_id, label) values ($1, 'VAN-2') returning id`, [cls.id]);
  const a = await one(`insert into zones (code, name) values ('a', 'A') returning id`);
  const b = await one(`insert into zones (code, name) values ('b', 'B') returning id`);
  await q(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
  f = { classId: cls.id, v1: v1.id, v2: v2.id, a: a.id, b: b.id };
});
after(async () => db && db.drop());

function officeBooking(o = {}) {
  const b = { booking_type: 'transfer', class_id: f.classId, from_zone_id: f.a, to_zone_id: f.b, pickup_address: 'x', dropoff_address: 'y',
    pickup_at: '2026-12-05T10:00:00+02:00', duration_minutes: 45, passengers: 2, customer_name: 'Phone Customer',
    customer_email: 'p@example.com', customer_phone: '+30', base_price_cents: 9000, price_cents: 9000, list_price_cents: 9000,
    status: 'confirmed', payment_status: 'paid', source: 'office', created_by: staffId, payment_method: 'cash', ...o };
  const cols = Object.keys(b);
  return q(`insert into bookings (${cols.join(',')}, blocked_range) values (${cols.map((_, i) => '$' + (i + 1)).join(',')},
    blocked_range_for($${cols.indexOf('pickup_at') + 1}::timestamptz, $${cols.indexOf('duration_minutes') + 1}::int, 30)) returning *`, Object.values(b)).then((r) => r[0]);
}

test('office booking: a price different from the list needs a reason; a discount below base is allowed for office only', async () => {
  await assert.rejects(officeBooking({ price_cents: 7000, pickup_at: '2026-12-05T08:00:00+02:00' }), (e) => e.code === '23514');
  const ok = await officeBooking({ price_cents: 7000, price_override_reason: 'Hotel partner rate', pickup_at: '2026-12-05T08:00:00+02:00' });
  assert.equal(ok.source, 'office');
  await assert.rejects(officeBooking({ source: 'online', created_by: null, payment_method: 'viva', price_cents: 7000, list_price_cents: null, pickup_at: '2026-12-05T12:00:00+02:00' }), (e) => e.code === '23514');
  await assert.rejects(officeBooking({ created_by: null, pickup_at: '2026-12-05T14:00:00+02:00' }), (e) => e.code === '23514');
});

test('offline payments are recorded without Viva fields; the refund limit still applies', async () => {
  const bk = await officeBooking({ pickup_at: '2026-12-06T10:00:00+02:00' });
  await q(`insert into payments (booking_id, kind, status, amount_cents, method, note, created_by) values ($1, 'payment', 'succeeded', 9000, 'cash', 'Paid to driver', $2)`, [bk.id, staffId]);
  await assert.rejects(q(`insert into payments (booking_id, kind, status, amount_cents, method, viva_order_code) values ($1, 'payment', 'succeeded', 100, 'cash', 123)`, [bk.id]), (e) => e.code === '23514');
  await assert.rejects(q(`insert into payments (booking_id, kind, status, amount_cents, method) values ($1, 'refund', 'succeeded', 9500, 'cash')`, [bk.id]));
});

test('office hold: uses office_link_hold_minutes, ignores the per-visitor limit, refuses non-staff and full classes', async () => {
  const h1 = (await q(`select * from create_office_hold('van', '2026-12-07T10:00:00+02:00', 45, $1)`, [staffId]))[0];
  const mins = (await q(`select extract(epoch from (expires_at - now())) / 60 as m from slot_holds where id = $1`, [h1.id]))[0].m;
  assert.ok(mins > 235 && mins <= 240, `hold minutes ${mins}`);
  await q(`select * from create_office_hold('van', '2026-12-07T10:00:00+02:00', 45, $1, 30)`, [staffId]); // second van: no visitor limit
  await assert.rejects(q(`select * from create_office_hold('van', '2026-12-07T10:00:00+02:00', 45, $1)`, [staffId]), /unavailable/);
  await assert.rejects(q(`select * from create_office_hold('van', '2026-12-08T10:00:00+02:00', 45, $1)`, ['00000000-0000-4000-8000-0000000000bb']), /forbidden/);
  await asRole(db.pool, 'authenticated', staffId, async (c) => {
    await assert.rejects(c.query(`select * from create_office_hold('van', '2026-12-09T10:00:00+02:00', 45, $1)`, [staffId]), (e) => e.code === '42501');
  });
});

test('fleet calendar: staff see bookings, holds and blocks per vehicle; strangers and anon see nothing', async () => {
  await officeBooking({ pickup_at: '2026-12-10T10:00:00+02:00', vehicle_id: f.v1, status: 'assigned' });
  await officeBooking({ pickup_at: '2026-12-10T15:00:00+02:00' });                      // waiting for a vehicle
  await q(`insert into blocked_slots (vehicle_id, range, reason) values ($1, tstzrange('2026-12-10T08:00:00+02:00', '2026-12-10T12:00:00+02:00'), 'Service')`, [f.v2]);
  const day = `tstzrange('2026-12-10T00:00:00+02:00', '2026-12-11T00:00:00+02:00')`;
  const rows = await asRole(db.pool, 'authenticated', staffId, async (c) => (await c.query(`select kind, vehicle_id, status, label, reason from calendar_items where range && ${day} order by lower(range)`)).rows);
  assert.deepEqual(rows.map((r) => r.kind), ['block', 'booking', 'booking']);
  assert.equal(rows[1].vehicle_id, f.v1);
  assert.equal(rows[2].vehicle_id, null);
  assert.equal(rows[0].reason, 'Service');
  const n = await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000cc', async (c) => (await c.query(`select count(*)::int n from calendar_items`)).rows[0].n);
  assert.equal(n, 0);
  await asRole(db.pool, 'anon', null, async (c) => {
    await assert.rejects(c.query(`select * from calendar_items`), (e) => e.code === '42501');
  });
});

test('fleet calendar: free vehicles per hour for a class follow bookings and blocks', async () => {
  const rows = await asRole(db.pool, 'authenticated', staffId, async (c) => (await c.query(`select to_char(hour_start at time zone 'Europe/Athens', 'HH24') h, free from class_free_by_hour($1, '2026-12-10')`, [f.classId])).rows);
  assert.equal(rows.length, 24);
  const at = Object.fromEntries(rows.map((r) => [r.h, r.free]));
  assert.equal(at['06'], 2);   // nothing yet
  assert.equal(at['10'], 0);   // VAN-1 on a booking, VAN-2 blocked for service
  assert.equal(at['13'], 2);
  assert.equal(at['15'], 1);   // one booking waiting for a vehicle
});

test('customers: every booking links to one customer per e-mail (case-insensitive), with counts', async () => {
  await officeBooking({ pickup_at: '2026-12-12T10:00:00+02:00', customer_email: 'Repeat@Example.com', customer_name: 'R. One' });
  await officeBooking({ pickup_at: '2026-12-13T10:00:00+02:00', customer_email: 'repeat@example.com ', customer_name: 'R. One', invoice_company: 'Repeat S.A.' });
  const [c] = await q(`select * from customers where lower(email) = 'repeat@example.com'`);
  assert.equal(c.bookings_count, 2);
  assert.equal(c.company, 'Repeat S.A.');
  const linked = await q(`select count(*)::int n from bookings where customer_id = $1`, [c.id]);
  assert.equal(linked[0].n, 2);
});

test('customers: staff can read and edit notes but not create or delete; strangers see nothing', async () => {
  await asRole(db.pool, 'authenticated', staffId, async (cl) => {
    const n = (await cl.query(`select count(*)::int n from customers`)).rows[0].n;
    assert.ok(n >= 1);
    await cl.query(`update customers set notes = 'Prefers V-Class' where lower(email) = 'repeat@example.com'`);
    await assert.rejects(cl.query(`update customers set email = 'x@example.com'`), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'authenticated', staffId, async (cl) => {
    await assert.rejects(cl.query(`insert into customers (email, name) values ('n@example.com', 'N')`), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'authenticated', staffId, async (cl) => {
    await assert.rejects(cl.query(`delete from customers`), (e) => e.code === '42501');
  });
  const n = await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000cc', async (cl) => (await cl.query(`select count(*)::int n from customers`)).rows[0].n);
  assert.equal(n, 0);
});

test('0013 customer list: counts, paid total net of refunds, VIP flag; staff only', async () => {
  const bk = await officeBooking({ pickup_at: '2026-12-20T10:00:00+02:00', customer_email: 'sum@example.com', customer_name: 'Sum Customer' });
  await q(
    `insert into payments (booking_id, kind, status, amount_cents, method) values ($1, 'payment', 'succeeded', 9000, 'cash'), ($1, 'refund', 'succeeded', 1000, 'cash')`,
    [bk.id],
  );
  const row = await asRole(db.pool, 'authenticated', staffId, async (c) =>
    (
      await c.query(
        `select bookings_count, paid_cents, has_vip_security from customer_summaries where email = 'sum@example.com'`,
      )
    ).rows[0],
  );
  assert.deepEqual(row, { bookings_count: 1, paid_cents: 8000, has_vip_security: false });
  const n = await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000cc', async (c) =>
    (await c.query(`select count(*)::int n from customer_summaries`)).rows[0].n,
  );
  assert.equal(n, 0);
});
