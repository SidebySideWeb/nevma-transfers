// 0025 pricing rules + 0026 quotes / hold duration.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db;
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];

before(async () => {
  db = await createTestDb({ seed: true });
});
after(async () => db && db.drop());

test('class_rates seed zeros + current_class_rates is latest', async () => {
  // Migration seeds rates for classes that exist at migrate time; demo seed adds any missing.
  await q(
    `insert into class_rates (class_key, base_fare, per_km, per_min, minimum_fare, km_per_hour, extra_km_rate)
     select key, 0, 0, 0, 0, 40, 0 from vehicle_classes c
      where not exists (select 1 from class_rates r where r.class_key = c.key)`,
  );
  const cur = await q(`select class_key, base_fare, per_km from current_class_rates order by class_key`);
  assert.ok(cur.length >= 5);
  assert.ok(cur.every((r) => Number(r.base_fare) === 0 && Number(r.per_km) === 0));

  await q(
    `insert into class_rates (class_key, base_fare, per_km, per_min, minimum_fare)
     values ('demo-e-class', 2500, 120, 40, 5000)`,
  );
  const e = await one(`select base_fare from current_class_rates where class_key = 'demo-e-class'`);
  assert.equal(Number(e.base_fare), 2500);
});

test('pricing_settings_valid rejects bad JSON', async () => {
  await assert.rejects(
    q(`insert into pricing_settings (doc) values ('{"rounding":3}'::jsonb)`),
    (e) => e.code === '23514',
  );
  const ok = await one(`select id from current_pricing_settings`);
  assert.ok(ok.id);
  const doc = await one(`select doc from pricing_settings where id = $1`, [ok.id]);
  assert.equal(doc.doc.quote_ttl_min, 20);
});

test('pricing_areas seed LGAV / ports', async () => {
  const areas = await q(`select label, kind, fee from pricing_areas order by label`);
  assert.deepEqual(
    areas.map((a) => a.label).sort(),
    ['LGAV', 'Lavrio', 'Piraeus', 'Rafina'],
  );
  assert.ok(areas.every((a) => Number(a.fee) === 0));
});

test('anon cannot read pricing tables', async () => {
  await asRole(db.pool, 'anon', null, async (c) => {
    await assert.rejects(c.query(`select * from class_rates`), (e) => e.code === '42501');
  });
});

test('hold window uses duration_min (blocked_range length)', async () => {
  const cls = await one(`select id, buffer_minutes from vehicle_classes where key = 'demo-e-class'`);
  const pickup = '2027-06-01T10:00:00+03:00';
  const duration = 90;
  const hold = await one(
    `select lower(blocked_range) as lo, upper(blocked_range) as hi, duration_minutes
       from create_hold('demo-e-class', $1::timestamptz, $2::int, 'vid-b3', 'transfer',
         (select id from zones where code = 'demo-airport'),
         (select id from zones where code = 'demo-centre'), null)`,
    [pickup, duration],
  );
  assert.equal(hold.duration_minutes, 90);
  const lo = new Date(hold.lo).getTime();
  const hi = new Date(hold.hi).getTime();
  const expectedMs = (duration + 2 * cls.buffer_minutes) * 60_000;
  assert.equal(hi - lo, expectedMs);
});

test('overlap constraint still blocks a double booking', async () => {
  const a = await one(`select id from zones where code = 'demo-airport'`);
  const b = await one(`select id from zones where code = 'demo-centre'`);
  const cls = await one(`select id, buffer_minutes from vehicle_classes where key = 'demo-e-class'`);
  const fleet = await q(`select id from vehicles where class_id = $1 and status = 'active'`, [cls.id]);
  const pickup = '2027-07-01T10:00:00+03:00';
  // Fill every vehicle with a confirmed overlapping booking so the class is full.
  for (let i = 0; i < fleet.length; i++) {
    await one(
      `insert into bookings (
         booking_type, class_id, vehicle_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
         pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, blocked_range
       ) values (
         'transfer', $3, $6, $4, $5, 'A', 'B', $1::timestamptz, 45, 1, 'C', $7, '+30',
         7000, 7000, 'confirmed', public.blocked_range_for($1::timestamptz, 45, $2::int)
       ) returning id`,
      [
        pickup,
        cls.buffer_minutes,
        cls.id,
        a.id,
        b.id,
        fleet[i].id,
        `c${i}@example.com`,
      ],
    );
  }
  await assert.rejects(
    one(
      `select id from create_hold('demo-e-class', $1::timestamptz, 45, 'vid-overlap', 'transfer', $2, $3, null)`,
      [pickup, a.id, b.id],
    ),
    (e) => /unavailable/i.test(e.message),
  );
});

test('quotes table + cleanup function', async () => {
  const row = await one(
    `insert into quotes (
       mode, pickup_at, duration_min, passengers, luggage, prices, expires_at,
       from_zone_code, to_zone_code
     ) values (
       'transfer', now() + interval '1 day', 40, 2, 1,
       '{"demo-e-class":{"total":7000,"available":true,"breakdown":[]}}'::jsonb,
       now() - interval '8 days',
       'demo-airport', 'demo-centre'
     ) returning id`,
  );
  const n = await one(`select public.cleanup_expired_quotes() as n`);
  assert.ok(Number(n.n) >= 1);
  const gone = await one(`select id from quotes where id = $1`, [row.id]);
  assert.equal(gone, undefined);
});
