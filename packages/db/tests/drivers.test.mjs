// 0015 Drivers and dispatch: assignment, shifts, trip status, driver API functions, pay, statements, reports, access.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db, f;
const staffId = '00000000-0000-4000-8000-00000000d001';
const userA = '00000000-0000-4000-8000-00000000d0a1';   // driver Alex's login
const userB = '00000000-0000-4000-8000-00000000d0b1';   // driver Bea's login
const stranger = '00000000-0000-4000-8000-00000000d0ff';
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const asStaff = (fn) => asRole(db.pool, 'authenticated', staffId, fn);
const asDriver = (uid, fn) => asRole(db.pool, 'authenticated', uid, fn);
// asRole rolls back; for steps that must persist, run as the driver and commit.
async function asDriverCommit(uid, fn) {
  const c = await db.pool.connect();
  try {
    await c.query('begin'); await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await fn(c); await c.query('commit'); return r;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

async function booking(o = {}) {
  const b = { booking_type: 'transfer', class_id: f.cls, from_zone_id: f.a, to_zone_id: f.b, pickup_address: 'Arrivals', dropoff_address: 'Hotel',
    pickup_at: '2026-12-01T10:00:00+02:00', duration_minutes: 45, passengers: 2, customer_name: 'Pat Customer', customer_email: 'pat@example.com',
    customer_phone: '+30 690 000 0000', base_price_cents: 12400, price_cents: 12400, status: 'assigned', ...o };
  const cols = Object.keys(b);
  return one(`insert into bookings (${cols.join(',')}, blocked_range) values (${cols.map((_, i) => '$' + (i + 1)).join(',')},
    blocked_range_for($${cols.indexOf('pickup_at') + 1}::timestamptz, $${cols.indexOf('duration_minutes') + 1}::int, 30)) returning *`, Object.values(b));
}

before(async () => {
  db = await createTestDb();
  await q(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
  const cls = await one(`insert into vehicle_classes (key, name, max_passengers, max_luggage) values ('v-class', 'V-Class', 7, 6) returning id`);
  const v1 = await one(`insert into vehicles (class_id, label) values ($1, 'V-Class #1') returning id`, [cls.id]);
  const v2 = await one(`insert into vehicles (class_id, label) values ($1, 'V-Class #2') returning id`, [cls.id]);
  const a = await one(`insert into zones (code, name) values ('ath-airport', 'Athens International Airport (AIA)') returning id`);
  const b = await one(`insert into zones (code, name) values ('athens-centre', 'Athens') returning id`);
  await q(`insert into zone_routes values ($1, $2, 45)`, [a.id, b.id]);
  const alex = await one(`insert into drivers (full_name, email, phone, user_id) values ('Alex Driver', 'alex@example.com', '+30 691 111 1111', $1) returning id`, [userA]);
  const bea = await one(`insert into drivers (full_name, email, phone, user_id) values ('Bea Driver', 'bea@example.com', '+30 692 222 2222', $1) returning id`, [userB]);
  f = { cls: cls.id, v1: v1.id, v2: v2.id, a: a.id, b: b.id, alex: alex.id, bea: bea.id };
});
after(async () => db && db.drop());

test('staff assign a driver; overlapping bookings for one driver are refused; inactive drivers cannot be assigned; every change is logged', async () => {
  const b1 = await booking({ vehicle_id: f.v1 });
  const b2 = await booking({ pickup_at: '2026-12-01T10:30:00+02:00', vehicle_id: f.v2 });
  await asStaff(async (c) => {
    await c.query(`update bookings set driver_id = $2 where id = $1`, [b1.id, f.alex]);
    await assert.rejects(c.query(`update bookings set driver_id = $2 where id = $1`, [b2.id, f.alex]), (e) => e.code === '23P01');
  });
  await asStaff((c) => c.query(`update bookings set driver_id = $2 where id = $1`, [b1.id, f.alex]));
  await q(`update bookings set driver_id = $2 where id = $1`, [b1.id, f.alex]);
  const ev = await q(`select kind, source from booking_events where booking_id = $1`, [b1.id]);
  assert.deepEqual(ev.map((e) => e.kind), ['driver_assigned']);
  await q(`update drivers set active = false where id = $1`, [f.bea]);
  await assert.rejects(q(`update bookings set driver_id = $2 where id = $1`, [b2.id, f.bea]), /driver_inactive/);
  await q(`update drivers set active = true where id = $1`, [f.bea]);
  await q(`update bookings set driver_id = $2 where id = $1`, [b2.id, f.bea]);
  f.b1 = b1; f.b2 = b2;
});

test('a driver starts the day with a free vehicle; one open shift per driver and per vehicle', async () => {
  const vs = await asDriver(userA, async (c) => (await c.query(`select label from driver_vehicles()`)).rows.map((r) => r.label));
  assert.deepEqual(vs, ['V-Class #1', 'V-Class #2']);
  await asDriverCommit(userA, (c) => c.query(`select * from driver_start_shift($1, 120500)`, [f.v1]));
  await asDriver(userA, async (c) => { await assert.rejects(c.query(`select * from driver_start_shift($1)`, [f.v2]), /already_on_shift/); });
  await asDriver(userB, async (c) => { await assert.rejects(c.query(`select * from driver_start_shift($1)`, [f.v1]), /vehicle_in_use/); });
  const left = await asDriver(userB, async (c) => (await c.query(`select label from driver_vehicles()`)).rows.map((r) => r.label));
  assert.deepEqual(left, ['V-Class #2']);
  const me = await asDriver(userA, async (c) => (await c.query(`select driver_me() m`)).rows[0].m);
  assert.equal(me.fullName, 'Alex Driver');
  assert.equal(me.shift.vehicleLabel, 'V-Class #1');
  const none = await asDriver(stranger, async (c) => (await c.query(`select driver_me() m`)).rows[0].m);
  assert.equal(none, null);
});

test('drivers see only their own jobs, without prices; the customer phone only near the trip', async () => {
  const jobs = await asDriver(userA, async (c) => (await c.query(`select * from driver_jobs('2026-12-01', '2026-12-07')`)).rows);
  assert.deepEqual(jobs.map((j) => j.reference), [f.b1.reference]);
  assert.equal(jobs[0].from_zone, 'Athens International Airport (AIA)');
  assert.equal(jobs[0].customer_phone, null);           // the trip is not within 24 h of now
  assert.ok(!('price_cents' in jobs[0]));
  const near = await booking({ pickup_at: new Date(Date.now() + 2 * 3600e3).toISOString(), driver_id: f.alex });
  const d = new Date(Date.now() + 2 * 3600e3).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
  const j2 = await asDriver(userA, async (c) => (await c.query(`select reference, customer_phone from driver_jobs($1, $1)`, [d])).rows);
  assert.equal(j2.find((j) => j.reference === near.reference).customer_phone, '+30 690 000 0000');
  await asDriver(userA, async (c) => { await assert.rejects(c.query(`select * from driver_jobs('2026-12-01', '2027-02-01')`), /31 days/); });
  await asDriver(stranger, async (c) => { await assert.rejects(c.query(`select * from driver_jobs('2026-12-01', '2026-12-02')`), /forbidden/); });
  const own = await asDriver(userA, async (c) => (await c.query(`select count(*)::int n from bookings`)).rows[0].n);
  assert.equal(own, 0);                                 // no direct access to the bookings table
  await q(`delete from bookings where id = $1`, [near.id]);
});

test('trip status: drivers move forward on their own bookings while on shift; completing ends the booking; staff can set any status', async () => {
  await asDriver(userB, async (c) => { await assert.rejects(c.query(`select set_trip_status($1, 'on_way')`, [f.b1.reference]), /not your booking/); });
  await asDriver(userB, async (c) => { await assert.rejects(c.query(`select set_trip_status($1, 'on_way')`, [f.b2.reference]), /no_shift/); });
  for (const s of ['on_way', 'arrived', 'on_board']) await asDriverCommit(userA, (c) => c.query(`select set_trip_status($1, $2)`, [f.b1.reference.toLowerCase(), s]));
  await asDriver(userA, async (c) => { await assert.rejects(c.query(`select set_trip_status($1, 'arrived')`, [f.b1.reference]), /invalid_transition/); });
  await asDriver(userA, async (c) => { await assert.rejects(c.query(`select set_trip_status($1, 'no_show')`, [f.b1.reference]), /invalid_transition/); });
  const now = await asStaff(async (c) => (await c.query(`select vehicle_label, driver_name, current_reference, current_trip_status from fleet_now where vehicle_label = 'V-Class #1'`)).rows[0]);
  assert.deepEqual(now, { vehicle_label: 'V-Class #1', driver_name: 'Alex Driver', current_reference: f.b1.reference, current_trip_status: 'on_board' });
  await asDriverCommit(userA, (c) => c.query(`select set_trip_status($1, 'completed', 'Dropped at the hotel')`, [f.b1.reference]));
  assert.deepEqual(await one(`select status, trip_status from bookings where id = $1`, [f.b1.id]), { status: 'completed', trip_status: 'completed' });
  const ev = await q(`select kind, source from booking_events where booking_id = $1 order by id`, [f.b1.id]);
  assert.deepEqual(ev.map((e) => e.kind), ['driver_assigned', 'on_way', 'arrived', 'on_board', 'completed']);
  assert.equal(ev.at(-1).source, 'driver');
  await asStaff((c) => c.query(`select set_trip_status($1, 'arrived')`, [f.b2.reference]));
  await asDriverCommit(userA, (c) => c.query(`select * from driver_end_shift(120610)`));
  await asDriver(userA, async (c) => { await assert.rejects(c.query(`select * from driver_end_shift()`), /no_shift/); });
});

test('pay: salary pro rata, daily, shift hours, percentage before VAT, fixed per transfer with class/route override, adjustments', async () => {
  await q(`insert into settings (key, value, description, is_demo) values ('vat_rate_bp', '2400', 'VAT', false) on conflict (key) do nothing`);
  const plan = await one(`insert into driver_pay_plans (driver_id, valid_from, monthly_salary_cents, daily_rate_cents, hourly_rate_cents, percent_bp, percent_base, per_transfer_cents)
                          values ($1, '2026-11-01', 120000, 1000, 500, 1000, 'net', 1500) returning id`, [f.alex]);
  await q(`insert into driver_pay_rates (plan_id, class_id, from_zone_id, to_zone_id, amount_cents) values ($1, $2, $3, $4, 2500)`, [plan.id, f.cls, f.a, f.b]);
  await q(`insert into driver_pay_adjustments (driver_id, on_date, kind, amount_cents, note) values ($1, '2026-12-01', 'tip', 1000, 'Cash tip'), ($1, '2026-12-02', 'advance', -5000, 'Advance')`, [f.alex]);
  await assert.rejects(q(`insert into driver_pay_adjustments (driver_id, on_date, kind, amount_cents, note) values ($1, '2026-12-02', 'deduction', 500, 'x')`, [f.alex]), (e) => e.code === '23514');
  // a closed shift on 1 Dec for the day and hours lines
  await q(`insert into driver_shifts (driver_id, vehicle_id, started_at, ended_at, source) values ($1, $2, '2026-12-01T08:00:00+02:00', '2026-12-01T16:00:00+02:00', 'office')`, [f.alex, f.v2]);
  const lines = await asStaff(async (c) => (await c.query(`select kind, reference, quantity, amount_cents from driver_earnings($1, '2026-12-01', '2026-12-31')`, [f.alex])).rows);
  const by = (k) => lines.filter((l) => l.kind === k);
  assert.equal(by('salary')[0].amount_cents, 120000);                       // full December
  assert.equal(by('day').length, 1);
  assert.equal(by('day')[0].amount_cents, 1000);
  assert.equal(Number(by('hours').find((l) => Number(l.quantity) === 8).amount_cents), 4000);
  assert.equal(by('percent')[0].amount_cents, 1000);                        // 10% of 124.00 / 1.24 = 10.00
  assert.equal(by('transfer')[0].amount_cents, 2500);                       // class + route override beats 15.00
  assert.deepEqual(by('adjustment').map((l) => l.amount_cents), [1000, -5000]);
  const half = await asStaff(async (c) => (await c.query(`select amount_cents from driver_earnings($1, '2026-11-16', '2026-11-30') where kind = 'salary'`, [f.alex])).rows[0]);
  assert.equal(half.amount_cents, 60000);                                   // 15 of 30 days
  await asDriver(userB, async (c) => { await assert.rejects(c.query(`select * from driver_earnings($1, '2026-12-01', '2026-12-31')`, [f.alex]), /forbidden/); });
  const mine = await asDriver(userA, async (c) => (await c.query(`select count(*)::int n from driver_earnings($1, '2026-12-01', '2026-12-31')`, [f.alex])).rows[0].n);
  assert.ok(mine > 0);
  await assert.rejects(q(`insert into driver_pay_plans (driver_id, valid_from) values ($1, '2027-01-01')`, [f.alex]), (e) => e.code === '23P01');
});

test('statements: build, recalculate while draft, approve freezes lines, mark paid with a reference', async () => {
  const sid = await asStaff(async (c) => (await c.query(`select driver_statement_build($1, '2026-12-01', '2026-12-31') id`, [f.alex])).rows[0].id);
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [staffId]).catch(() => {});
  const c = await db.pool.connect();
  try {
    await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [staffId]);
    const id = (await c.query(`select driver_statement_build($1, '2026-12-01', '2026-12-31') id`, [f.alex])).rows[0].id;
    const total = (await c.query(`select total_cents from driver_statements where id = $1`, [id])).rows[0].total_cents;
    assert.equal(total, 120000 + 1000 + 4000 + 1000 + 2500 + 1000 - 5000);
    await c.query(`select driver_statement_approve($1)`, [id]);
    await assert.rejects(c.query(`select driver_statement_build($1, '2026-12-01', '2026-12-31')`, [f.alex]), /statement_locked/);
    await c.query('rollback');
  } finally { c.release(); }
  assert.ok(sid);
  // persisted path
  const id = (await asDriverCommit(staffId, (cl) => cl.query(`select driver_statement_build($1, '2026-12-01', '2026-12-31') id`, [f.alex]))).rows[0].id;
  await asDriverCommit(staffId, (cl) => cl.query(`select driver_statement_approve($1)`, [id]));
  await assert.rejects(q(`delete from driver_statement_lines where statement_id = $1`, [id]), /statement_locked/);
  await asStaff(async (cl) => { await assert.rejects(cl.query(`select driver_statement_mark_paid($1, ' ')`, [id]), /payment reference/); });
  await asDriverCommit(staffId, (cl) => cl.query(`select driver_statement_mark_paid($1, 'BANK-2026-12-31-01')`, [id]));
  assert.equal((await one(`select status from driver_statements where id = $1`, [id])).status, 'paid');
  await asStaff(async (cl) => { await assert.rejects(cl.query(`select driver_statement_build($1, '2026-12-15', '2027-01-15')`, [f.alex]), (e) => e.code === '23P01'); });
  await asDriver(userA, async (cl) => { await assert.rejects(cl.query(`select driver_statement_build($1, '2027-01-01', '2027-01-31')`, [f.alex]), /forbidden/); });
});

test('reports: driver pay, vehicle usage and bookings per day for staff only', async () => {
  const pay = await asStaff(async (c) => (await c.query(`select full_name, jobs, days_worked, total_cents, statement_status from report_driver_pay('2026-12-01', '2026-12-31')`)).rows);
  const alex = pay.find((p) => p.full_name === 'Alex Driver');
  assert.equal(alex.jobs, 1);
  assert.equal(alex.days_worked, 1);
  assert.equal(alex.statement_status, 'paid');
  const veh = await asStaff(async (c) => (await c.query(`select label, jobs, shift_hours from report_vehicle_usage('2026-12-01', '2026-12-31')`)).rows);
  assert.equal(veh.find((v) => v.label === 'V-Class #1').jobs, 1);
  assert.equal(Number(veh.find((v) => v.label === 'V-Class #2').shift_hours), 8);
  const days = await asStaff(async (c) => (await c.query(`select day, completed, revenue_cents from report_bookings_per_day('2026-12-01', '2026-12-02')`)).rows);
  assert.equal(days.length, 2);
  assert.equal(days[0].completed, 1);
  assert.equal(days[0].revenue_cents, 12400);
  const none = await asDriver(userA, async (c) => (await c.query(`select count(*)::int n from report_driver_pay('2026-12-01', '2026-12-31')`)).rows[0].n);
  assert.equal(none, 0);
});

test('access: drivers read only their own driver row and shifts; pay tables are staff only; nobody edits a driver login link', async () => {
  const rows = await asDriver(userA, async (c) => (await c.query(`select full_name from drivers`)).rows);
  assert.deepEqual(rows.map((r) => r.full_name), ['Alex Driver']);
  const shifts = await asDriver(userB, async (c) => (await c.query(`select count(*)::int n from driver_shifts`)).rows[0].n);
  assert.equal(shifts, 0);
  for (const t of ['driver_pay_plans', 'driver_pay_adjustments', 'driver_statements', 'booking_events']) {
    const n = await asDriver(userA, async (c) => (await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
    assert.equal(n, 0, t);
  }
  await asStaff(async (c) => { await assert.rejects(c.query(`update drivers set user_id = null where id = $1`, [f.alex]), (e) => e.code === '42501'); });
  await asStaff(async (c) => { await c.query(`update drivers set phone = '+30 699 999 9999', licence_expires_on = '2027-06-30' where id = $1`, [f.alex]); });
  const changed = await asDriver(userA, async (c) => (await c.query(`update drivers set phone = 'x' where id = $1`, [f.alex])).rowCount);
  assert.equal(changed, 0);                              // drivers cannot edit their record (the office does)
  await asRole(db.pool, 'anon', null, async (c) => { await assert.rejects(c.query(`select * from drivers_now`), (e) => e.code === '42501'); });
});
