import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createTestDb } from './harness.mjs';

let db;
let ids;

async function fixture(pool, { vehicles = 2, classKey = 'van' } = {}) {
  const q = (sql, p) => pool.query(sql, p).then((r) => r.rows[0]);
  const cls = await q(`insert into vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes) values ($1, 'Van', 7, 7, 30) returning id`, [classKey]);
  const vs = [];
  for (let i = 0; i < vehicles; i++) vs.push((await q(`insert into vehicles (class_id, label) values ($1, $2) returning id`, [cls.id, `${classKey}-${i}`])).id);
  const za = await q(`insert into zones (code, name) values ($1, 'A') returning id`, [`${classKey}-a`]);
  const zb = await q(`insert into zones (code, name) values ($1, 'B') returning id`, [`${classKey}-b`]);
  await q(`insert into zone_routes values ($1, $2, 45)`, [za.id, zb.id]);
  await q(`insert into zone_prices (from_zone_id, to_zone_id, class_id, price_cents) values ($1, $2, $3, 9000)`, [za.id, zb.id, cls.id]);
  await q(`insert into hourly_rates (class_id, price_per_hour_cents) values ($1, 6000)`, [cls.id]);
  return { classId: cls.id, classKey, vehicles: vs, zoneA: za.id, zoneB: zb.id };
}

let extrasIds;
async function extras(pool) {
  const r = await pool.query(`insert into extras (code, name, price_cents) values ('vip-security', 'VIP security', 15000), ('night-surcharge', 'Night', 2000) on conflict (code) do update set name = excluded.name returning id, code`);
  return Object.fromEntries(r.rows.map((x) => [x.code, x.id]));
}

function booking(f, o = {}) {
  const b = {
    booking_type: 'transfer', class_id: f.classId, vehicle_id: null, from_zone_id: f.zoneA, to_zone_id: f.zoneB,
    pickup_address: 'Street 1', dropoff_address: 'Street 2', pickup_at: '2026-12-01T10:00:00+02:00', hours: null,
    duration_minutes: 45, passengers: 2, customer_name: 'Test Customer', customer_email: 'test@example.com',
    customer_phone: '+300000000000', base_price_cents: 9000, price_cents: 9000, status: 'confirmed', ...o,
  };
  return b;
}

async function insertBooking(client, b) {
  const cols = Object.keys(b);
  const vals = Object.values(b);
  const sql = `insert into bookings (${cols.join(', ')}, blocked_range)
               values (${cols.map((_, i) => '$' + (i + 1)).join(', ')},
                       blocked_range_for($${cols.indexOf('pickup_at') + 1}::timestamptz, $${cols.indexOf('duration_minutes') + 1}::int, 30))
               returning *`;
  return (await client.query(sql, vals)).rows[0];
}

before(async () => {
  db = await createTestDb();
  ids = await fixture(db.pool);
  extrasIds = await extras(db.pool);
});
after(async () => db && db.drop());

test('AC-02 overlapping bookings on the same vehicle are rejected', async () => {
  await insertBooking(db.pool, booking(ids, { vehicle_id: ids.vehicles[0], status: 'assigned' }));
  await assert.rejects(
    insertBooking(db.pool, booking(ids, { vehicle_id: ids.vehicles[0], status: 'assigned', pickup_at: '2026-12-01T10:30:00+02:00' })),
    (e) => e.code === '23P01',
  );
});

test('AC-02 overlapping bookings on different vehicles are allowed', async () => {
  const b = await insertBooking(db.pool, booking(ids, { vehicle_id: ids.vehicles[1], status: 'assigned', pickup_at: '2026-12-01T10:30:00+02:00' }));
  assert.ok(b.id);
});

test('AC-03 hourly bookings need whole hours between 1 and 24 and no drop-off', async () => {
  const hourly = (h) => booking(ids, { booking_type: 'hourly', to_zone_id: null, dropoff_address: null, hours: h, duration_minutes: (h ?? 1) * 60, pickup_at: '2026-12-05T10:00:00+02:00' });
  for (const bad of [0, 25, null]) {
    await assert.rejects(insertBooking(db.pool, hourly(bad)), (e) => e.code === '23514', `hours ${bad} should fail`);
  }
  for (const ok of [3, 12]) assert.ok((await insertBooking(db.pool, hourly(ok))).id);
  await assert.rejects(insertBooking(db.pool, { ...hourly(3), dropoff_address: 'Somewhere' }), (e) => e.code === '23514');
  await assert.rejects(insertBooking(db.pool, { ...hourly(3), duration_minutes: 200 }), (e) => e.code === '23514');
});

test('AC-03 a transfer needs two different zones and no hours', async () => {
  await assert.rejects(insertBooking(db.pool, booking(ids, { to_zone_id: ids.zoneA })), (e) => e.code === '23514');
  await assert.rejects(insertBooking(db.pool, booking(ids, { hours: 3 })), (e) => e.code === '23514');
  await assert.rejects(insertBooking(db.pool, booking(ids, { dropoff_address: null })), (e) => e.code === '23514');
});

test('AC-14 blocked range across the Athens DST change is in real hours', async () => {
  // 25 Oct 2026: clocks go back at 04:00 EEST to 03:00 EET.
  const r = (await db.pool.query(`select upper(r) - lower(r) as len, lower(r) as lo, upper(r) as hi
     from (select blocked_range_for('2026-10-25T02:30:00+03:00', 180, 30) r) x`)).rows[0];
  assert.equal(r.len.hours, 4);
  assert.equal(r.lo.toISOString(), '2026-10-24T23:00:00.000Z');
  assert.equal(r.hi.toISOString(), '2026-10-25T03:00:00.000Z');
});

test('AC-08 refunds can never exceed the amount paid', async () => {
  const b = await insertBooking(db.pool, booking(ids, { pickup_at: '2026-12-10T10:00:00+02:00' }));
  await db.pool.query(`insert into payments (booking_id, kind, status, amount_cents, viva_transaction_id) values ($1, 'payment', 'succeeded', 9000, gen_random_uuid())`, [b.id]);
  await assert.rejects(
    db.pool.query(`insert into payments (booking_id, kind, status, amount_cents) values ($1, 'refund', 'pending', 9001)`, [b.id]),
    (e) => e.code === '23514' && /refund_exceeds_paid/.test(e.message),
  );
  await db.pool.query(`insert into payments (booking_id, kind, status, amount_cents) values ($1, 'refund', 'succeeded', 4000)`, [b.id]);
  await db.pool.query(`insert into payments (booking_id, kind, status, amount_cents) values ($1, 'refund', 'succeeded', 5000)`, [b.id]);
  await assert.rejects(
    db.pool.query(`insert into payments (booking_id, kind, status, amount_cents) values ($1, 'refund', 'pending', 1)`, [b.id]),
    (e) => e.code === '23514',
  );
  // a failed refund attempt is recorded without counting
  await db.pool.query(`insert into payments (booking_id, kind, status, amount_cents) values ($1, 'refund', 'failed', 100)`, [b.id]);
});

test('AC-07 the same Viva transaction cannot be recorded twice; refund idempotency keys are unique', async () => {
  const b = await insertBooking(db.pool, booking(ids, { pickup_at: '2026-12-11T10:00:00+02:00' }));
  const tx = '6f1f6a1e-1111-4a4a-9b9b-000000000001';
  await db.pool.query(`insert into payments (booking_id, kind, status, amount_cents, viva_transaction_id) values ($1, 'payment', 'succeeded', 9000, $2)`, [b.id, tx]);
  await assert.rejects(
    db.pool.query(`insert into payments (booking_id, kind, status, amount_cents, viva_transaction_id) values ($1, 'payment', 'succeeded', 9000, $2)`, [b.id, tx]),
    (e) => e.code === '23505',
  );
  await db.pool.query(`insert into payments (booking_id, kind, status, amount_cents, idempotency_key) values ($1, 'refund', 'pending', 100, 'refund-abc')`, [b.id]);
  await assert.rejects(
    db.pool.query(`insert into payments (booking_id, kind, status, amount_cents, idempotency_key) values ($1, 'refund', 'pending', 100, 'refund-abc')`, [b.id]),
    (e) => e.code === '23505',
  );
});

test('AC-04 expire_holds ends old holds and unpaid pending bookings, keeps fresh ones', async () => {
  const range = `[2026-12-20 10:00+02, 2026-12-20 12:00+02)`;
  const old = (await db.pool.query(`insert into slot_holds (class_id, visitor_key, blocked_range, expires_at) values ($1, 'v-old', $2, now() - interval '1 minute') returning id`, [ids.classId, range])).rows[0];
  const fresh = (await db.pool.query(`insert into slot_holds (class_id, visitor_key, blocked_range, expires_at) values ($1, 'v-new', $2, now() + interval '10 minutes') returning id`, [ids.classId, range])).rows[0];
  const pend = await insertBooking(db.pool, booking(ids, { status: 'pending', hold_expires_at: new Date(Date.now() - 60000).toISOString(), pickup_at: '2026-12-21T10:00:00+02:00' }));
  await db.pool.query(`select expire_holds()`);
  const st = async (id) => (await db.pool.query(`select status from slot_holds where id = $1`, [id])).rows[0].status;
  assert.equal(await st(old.id), 'expired');
  assert.equal(await st(fresh.id), 'active');
  assert.equal((await db.pool.query(`select status from bookings where id = $1`, [pend.id])).rows[0].status, 'expired');
});

test('AC-04 an expired hold never blocks availability, even before the cron runs', async () => {
  const f = await fixture(db.pool, { vehicles: 1, classKey: 'solo' });
  const r = `[2027-01-10 10:00+02, 2027-01-10 12:00+02)`;
  await db.pool.query(`insert into slot_holds (class_id, visitor_key, blocked_range, expires_at) values ($1, 'v', $2, now() - interval '1 second')`, [f.classId, r]);
  assert.equal((await db.pool.query(`select class_availability($1, $2::tstzrange) n`, [f.classId, r])).rows[0].n, 1);
});

test('AC-05 two visitors racing for the last vehicle: exactly one hold succeeds', async () => {
  const f = await fixture(db.pool, { vehicles: 1, classKey: 'last' });
  const url = db.pool.options.connectionString;
  const c1 = new pg.Client({ connectionString: url });
  const c2 = new pg.Client({ connectionString: url });
  await c1.connect();
  await c2.connect();
  try {
    await c1.query('begin');
    await c2.query('begin');
    await c1.query(`select create_hold('last', '2027-02-01T10:00:00+02:00', 60, 'visitor-1')`);
    const second = c2.query(`select create_hold('last', '2027-02-01T10:30:00+02:00', 60, 'visitor-2')`); // waits on the class lock
    await new Promise((r) => setTimeout(r, 200));
    await c1.query('commit');
    await assert.rejects(second, /unavailable/);
    await c2.query('rollback');
  } finally {
    await c1.end();
    await c2.end();
  }
  // a later, non-overlapping time is still free
  const ok = await db.pool.query(`select (create_hold('last', '2027-02-01T18:00:00+02:00', 60, 'visitor-3')).id`);
  assert.ok(ok.rows[0].id);
});

test('AC-05 a visitor can hold at most two slots at once', async () => {
  const f = await fixture(db.pool, { vehicles: 5, classKey: 'many' });
  await db.pool.query(`select create_hold('many', '2027-03-01T10:00:00+02:00', 60, 'greedy')`);
  await db.pool.query(`select create_hold('many', '2027-03-01T14:00:00+02:00', 60, 'greedy')`);
  await assert.rejects(db.pool.query(`select create_hold('many', '2027-03-01T18:00:00+02:00', 60, 'greedy')`), /too_many_holds/);
  assert.ok(f.classId);
});

test('AC-09 vip_security follows the vip-security extra on the booking', async () => {
  const b = await insertBooking(db.pool, booking(ids, { pickup_at: '2026-12-12T10:00:00+02:00', price_cents: 24000 }));
  await db.pool.query(`insert into booking_extras (booking_id, extra_id, price_cents) values ($1, $2, 15000)`, [b.id, extrasIds['vip-security']]);
  const flag = async () => (await db.pool.query(`select vip_security from bookings where id = $1`, [b.id])).rows[0].vip_security;
  assert.equal(await flag(), true);
  await db.pool.query(`delete from booking_extras where booking_id = $1`, [b.id]);
  assert.equal(await flag(), false);
});

test('booking references look like ELP-XXXXXX without ambiguous characters', async () => {
  const b = await insertBooking(db.pool, booking(ids, { pickup_at: '2026-12-13T10:00:00+02:00' }));
  assert.match(b.reference, /^ELP-[A-HJ-NP-Z2-9]{6}$/);
});

test('AC-37: 0010 VAT — € 220.00 → € 177.42 + € 42.58; rate change leaves past bookings', async () => {
  const b = await insertBooking(db.pool, booking(ids, {
    pickup_at: '2026-12-14T10:00:00+02:00',
    base_price_cents: 22000,
    price_cents: 22000,
  }));
  const { rows: [r] } = await db.pool.query(
    'select vat_rate_bp, vat_cents, price_cents - vat_cents as net from public.bookings where id = $1',
    [b.id],
  );
  assert.equal(r.vat_rate_bp, 2400);
  assert.equal(r.vat_cents, 4258);
  assert.equal(r.net, 17742);
  await db.pool.query("update public.settings set value = '1300' where key = 'vat_rate_bp'");
  const { rows: [again] } = await db.pool.query(
    'select vat_rate_bp from public.bookings where id = $1',
    [b.id],
  );
  assert.equal(again.vat_rate_bp, 2400, 'a later rate change does not touch past bookings');
  const { rows: [f] } = await db.pool.query('select public.vat_from_gross(7000, 2400) as v');
  assert.equal(f.v, 1355);
  await db.pool.query("update public.settings set value = '2400' where key = 'vat_rate_bp'");
});
