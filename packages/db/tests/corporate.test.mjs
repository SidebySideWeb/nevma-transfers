// 0030 corporate (B9)
import { randomUUID } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db;
const userA = '00000000-0000-4000-8000-00000000c0a1';
const userB = '00000000-0000-4000-8000-00000000c0b1';
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];

before(async () => {
  db = await createTestDb({ seed: true });
});
after(async () => db && db.drop());

async function makeCompany(name = `Co ${randomUUID().slice(0, 6)}`) {
  return one(
    `insert into companies (name, kind, billing_email, pay_on_account, credit_limit_cents, discount_pct)
     values ($1, 'hotel', $2, true, 50000, 10)
     returning *`,
    [name, `${randomUUID().slice(0, 8)}@example.com`],
  );
}

test('B9 company_statement_total excludes cancellations', async () => {
  const co = await makeCompany();
  const a = await one(`select id from zones where code = 'demo-airport'`);
  const b = await one(`select id from zones where code = 'demo-centre'`);
  const cls = await one(`select id, buffer_minutes from vehicle_classes where key = 'demo-e-class'`);
  const pickup = '2027-06-15T12:00:00+03:00';
  const mk = async (status, price) =>
    one(
      `insert into bookings (
         booking_type, class_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
         pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, blocked_range, company_id, payment_method, payment_status
       ) values (
         'transfer', $1, $2, $3, 'A', 'B', $4::timestamptz, 45, 1,
         'G', $5, '+30', $6, $6, $7,
         public.blocked_range_for($4::timestamptz, 45, $8),
         $9, 'on_account', 'unpaid'
       ) returning id`,
      [
        cls.id,
        a.id,
        b.id,
        pickup,
        `g-${randomUUID().slice(0, 8)}@example.com`,
        price,
        status,
        cls.buffer_minutes,
        co.id,
      ],
    );
  await mk('confirmed', 10000);
  await mk('cancelled', 8000);
  const total = await one(
    `select public.company_statement_total_cents($1::uuid, '2027-06-01'::date, '2027-06-30'::date) as n`,
    [co.id],
  );
  assert.equal(total.n, 10000);
});

test('B9 company_open_balance_cents sums unpaid on_account', async () => {
  const co = await makeCompany();
  const bal0 = await one(`select public.company_open_balance_cents($1::uuid) as n`, [co.id]);
  assert.equal(bal0.n, 0);
});

test('B9 company_prices unique per transfer route', async () => {
  const co = await makeCompany();
  const a = await one(`select id from zones where code = 'demo-airport'`);
  const b = await one(`select id from zones where code = 'demo-centre'`);
  const cls = await one(`select id from vehicle_classes where key = 'demo-e-class'`);
  await q(
    `insert into company_prices (company_id, class_id, booking_type, from_zone_id, to_zone_id, price_cents)
     values ($1, $2, 'transfer', $3, $4, 5500)`,
    [co.id, cls.id, a.id, b.id],
  );
  await assert.rejects(
    () =>
      q(
        `insert into company_prices (company_id, class_id, booking_type, from_zone_id, to_zone_id, price_cents)
         values ($1, $2, 'transfer', $3, $4, 6000)`,
        [co.id, cls.id, a.id, b.id],
      ),
  );
});

test('B9 RLS: company A user cannot read company B bookings, statements or prices', async () => {
  const coA = await makeCompany('Hotel A');
  const coB = await makeCompany('Hotel B');
  await q(
    `insert into company_users (company_id, user_id, email, role) values
       ($1, $2, 'a@example.com', 'booker'),
       ($3, $4, 'b@example.com', 'booker')`,
    [coA.id, userA, coB.id, userB],
  );
  const a = await one(`select id from zones where code = 'demo-airport'`);
  const b = await one(`select id from zones where code = 'demo-centre'`);
  const cls = await one(`select id, buffer_minutes from vehicle_classes where key = 'demo-e-class'`);
  const bookingB = await one(
    `insert into bookings (
       booking_type, class_id, from_zone_id, to_zone_id, pickup_address, dropoff_address,
       pickup_at, duration_minutes, passengers, customer_name, customer_email, customer_phone,
       base_price_cents, price_cents, status, blocked_range, company_id, payment_method
     ) values (
       'transfer', $1, $2, $3, 'A', 'B', '2027-07-01T10:00:00+03:00'::timestamptz, 45, 1,
       'G', 'g@example.com', '+30', 7000, 7000, 'confirmed',
       public.blocked_range_for('2027-07-01T10:00:00+03:00'::timestamptz, 45, $4),
       $5, 'on_account'
     ) returning id`,
    [cls.id, a.id, b.id, cls.buffer_minutes, coB.id],
  );
  await q(
    `insert into company_prices (company_id, class_id, booking_type, from_zone_id, to_zone_id, price_cents)
     values ($1, $2, 'transfer', $3, $4, 5000)`,
    [coB.id, cls.id, a.id, b.id],
  );
  await q(
    `insert into company_statements (company_id, period_from, period_to, total_cents, status)
     values ($1, '2027-07-01', '2027-07-31', 7000, 'draft')`,
    [coB.id],
  );

  const seen = await asRole(db.pool, 'authenticated', userA, async (c) => {
    const bookings = (await c.query(`select id from bookings where id = $1`, [bookingB.id])).rowCount;
    const prices = (await c.query(`select id from company_prices where company_id = $1`, [coB.id]))
      .rowCount;
    const stmts = (await c.query(`select id from company_statements where company_id = $1`, [coB.id]))
      .rowCount;
    const ownCo = (await c.query(`select id from companies where id = $1`, [coA.id])).rowCount;
    const otherCo = (await c.query(`select id from companies where id = $1`, [coB.id])).rowCount;
    return { bookings, prices, stmts, ownCo, otherCo };
  });
  assert.equal(seen.bookings, 0);
  assert.equal(seen.prices, 0);
  assert.equal(seen.stmts, 0);
  assert.equal(seen.ownCo, 1);
  assert.equal(seen.otherCo, 0);
});
