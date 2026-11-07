import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';

// Booking v2 fixes (0032). Needs migrations up to 0032 and the demo seed.
const db = await createTestDb({ seed: true });
const pool = db.pool;
const q = (s, p) => pool.query(s, p);
const STAFF = '00000000-0000-0000-0000-0000000000cc';
await q(`insert into auth.users (id) values ($1) on conflict do nothing`, [STAFF]).catch(() => {});
await q(`insert into public.staff (user_id, email) values ($1, 'staff@test.gr') on conflict do nothing`, [STAFF]);

async function quote({ mode='transfer', from='demo-airport', to='demo-centre', dist=null, coords=false, sameZone=false,
  pax=2, lug=1, cls='demo-e-class', total=10000, ret=null, company=null, at="now() + interval '3 days'" } = {}) {
  const prices = {}; prices[cls] = ret ? { available: true, outbound: ret.o, return: ret.r, total: ret.t, breakdown: [] }
                                       : { available: true, total, breakdown: [] };
  const r = await q(`insert into quotes (mode, pickup_place_id,pickup_lat,pickup_lng, dropoff_place_id,dropoff_lat,dropoff_lng,
     pickup_at, hours, distance_km, duration_min, from_zone_code, to_zone_code, passengers, luggage, prices, expires_at,
     return_pickup_at, return_duration_min, company_id)
    values ($1, $2,$3,$4, $5,$6,$7, ${at}, $8, $9, ${mode==='hourly' ? 240 : 40}, $10, $11, $12, $13, $14, now()+interval '20 min', ${ret ? ret.at : 'null'}, $15, $16) returning id`,
    [mode, coords ? 'ChIJplaceAAAAA1' : null, coords ? 37.97 : null, coords ? 23.72 : null,
     coords && mode==='transfer' ? 'ChIJplaceBBBBB2' : null, coords && mode==='transfer' ? 38.07 : null, coords && mode==='transfer' ? 23.81 : null,
     mode==='hourly' ? 4 : null, dist, from, mode==='hourly' ? null : (sameZone ? from : to), pax, lug, prices,
     ret ? 40 : null, company]);
  return r.rows[0].id;
}
async function book(id, { cls='demo-e-class', pax=2, lug=1 } = {}) {
  const r = await q(`select create_booking_from_quote($1,$2,'v1','Addr A','Addr B',$3,$4,null,null,null,'N','n@x.gr','+30690',null,null,null,null) j`, [id, cls, pax, lug]);
  return r.rows[0].j;
}
const err = async (p, re) => { await assert.rejects(p, (e) => { assert.match(e.message, re); return true; }); };

test('1: distance quote with no zones books', async () => {
  const j = await book(await quote({ from: null, to: null, dist: 23.4, coords: true }));
  const b = (await q('select from_zone_id, to_zone_id, distance_km from bookings where id=$1', [j.booking_id])).rows[0];
  assert.equal(b.from_zone_id, null); assert.equal(Number(b.distance_km), 23.4);
});
test('1: same zone both ends, distance → books, zones dropped', async () => {
  const j = await book(await quote({ dist: 6.1, coords: true, sameZone: true, from: 'demo-north' }));
  const b = (await q('select from_zone_id from bookings where id=$1', [j.booking_id])).rows[0];
  assert.equal(b.from_zone_id, null);
});
test('1: zone quote missing zone still refused', async () => {
  await err(book(await quote({ to: null })), /quote missing zones/);
});
test('1: hourly with only a pick-up place books', async () => {
  const j = await book(await quote({ mode: 'hourly', from: null, coords: true, at: "now() + interval '40 days'" }));
  assert.ok(j.booking_id);
});
test('10: company quote refused on public checkout', async () => {
  const c = (await q(`insert into companies (name, kind) values ('Hotel X','hotel') returning id`)).rows[0].id;
  await err(book(await quote({ company: c })), /company quote/);
});
test('8: passengers differ / exceed class', async () => {
  await err(book(await quote({ pax: 2 }), { pax: 3 }), /differ from the quote/);
  await err(book(await quote({ pax: 5, lug: 1 }), { pax: 5 }), /takes 3 passengers/);
});
test('9: return total must equal legs', async () => {
  await err(book(await quote({ ret: { o: 5000, r: 4500, t: 9000, at: "now() + interval '4 days'" } })), /no_price/);
});
test('4: return overlapping on last vehicle → unavailable, no holds left', async () => {
  await q(`update vehicles set status='maintenance' where id in (select v.id from vehicles v join vehicle_classes c on c.id=v.class_id where c.key='demo-s-class' limit 1)`);
  const before = (await q(`select count(*)::int n from slot_holds`)).rows[0].n;
  const id = await quote({ cls: 'demo-s-class', at: "now() + interval '10 days'", ret: { o: 5000, r: 5000, t: 10000, at: "now() + interval '10 days' + interval '45 min'" } });
  await err(book(id, { cls: 'demo-s-class' }), /unavailable/);
  assert.equal((await q(`select count(*)::int n from slot_holds`)).rows[0].n, before);
});
test('4: return far apart books two legs', async () => {
  const j = await book(await quote({ cls: 'demo-s-class', at: "now() + interval '12 days'", ret: { o: 5000, r: 4000, t: 9000, at: "now() + interval '15 days'" } }), { cls: 'demo-s-class' });
  assert.ok(j.return_booking_id); assert.equal(j.price_cents, 9000);
});
test('5: mixed legs → late_unavailable on top', async () => {
  const j = await book(await quote({ cls: 'demo-s-class', at: "now() + interval '20 days'", ret: { o: 5000, r: 4000, t: 9000, at: "now() + interval '25 days'" } }), { cls: 'demo-s-class' });
  await q(`update bookings set viva_order_code=777001 where trip_group_id=$1`, [j.trip_group_id]);
  await q(`update bookings set hold_expires_at=now()-interval '1 min' where id=$1`, [j.booking_id]);
  const other = await book(await quote({ cls: 'demo-s-class', at: "now() + interval '20 days'" }), { cls: 'demo-s-class' });
  await q(`update bookings set status='confirmed', payment_status='paid' where id=$1`, [other.booking_id]);
  const r = (await q(`select record_viva_payment(777001, gen_random_uuid(), 9000) j`)).rows[0].j;
  assert.equal(r.outcome, 'late_unavailable');
  assert.deepEqual(r.legs.map((l) => l.outcome), ['late_unavailable', 'confirmed']);
});
test('6, 7: shift_pickup keeps hold expiry, respects blocked slots', async () => {
  const j = await book(await quote({ at: "now() + interval '30 days'" }));
  const v = (await q(`select v.id from vehicles v join vehicle_classes c on c.id=v.class_id where c.key='demo-e-class' and v.status='active' limit 1`)).rows[0].id;
  const b0 = (await q(`update bookings set vehicle_id=$2 where id=$1 returning hold_expires_at, pickup_at`, [j.booking_id, v])).rows[0];
  const ok = (await q(`select shift_pickup($1, $2::timestamptz + interval '40 min', 'test') j`, [j.booking_id, b0.pickup_at])).rows[0].j;
  assert.equal(ok.ok, true);
  const b1 = (await q('select hold_expires_at from bookings where id=$1', [j.booking_id])).rows[0];
  assert.equal(b1.hold_expires_at.getTime(), b0.hold_expires_at.getTime());
  await q(`insert into blocked_slots (vehicle_id, range, reason) values ($1, tstzrange($2::timestamptz + interval '2 h', $2::timestamptz + interval '5 h'), 'service')`, [v, b0.pickup_at]);
  const no = (await q(`select shift_pickup($1, $2::timestamptz + interval '3 h', 'test') j`, [j.booking_id, b0.pickup_at])).rows[0].j;
  assert.equal(no.reason, 'conflict');
});
async function as(role, uid, sql, p) {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query(`set local role ${role}`);
    if (uid) await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    return await c.query(sql, p); } finally { await c.query('rollback'); c.release(); }
}
test('3: anon cannot call corporate functions', async () => {
  const c = (await q(`select id from companies limit 1`)).rows[0].id;
  await err(as('anon', null, `select company_open_balance_cents($1)`, [c]), /permission denied/);
  await err(as('anon', null, `select company_statement_total_cents($1, '2026-01-01', '2026-12-31')`, [c]), /permission denied/);
  await err(as('authenticated', '00000000-0000-0000-0000-0000000000aa', `select company_open_balance_cents($1)`, [c]), /permission denied/);
});
test('2: company user cannot read rates through views', async () => {
  const c = (await q(`select id from companies limit 1`)).rows[0].id;
  const uid = '00000000-0000-0000-0000-0000000000bb';
  await q(`insert into company_users (company_id, user_id, email, role) values ($1,$2,'b@h.gr','booker') on conflict do nothing`, [c, uid]);
  assert.equal((await as('authenticated', uid, 'select * from current_class_rates')).rowCount, 0);
  assert.equal((await as('authenticated', uid, 'select * from current_pricing_settings')).rowCount, 0);
  const bal = (await as('authenticated', uid, 'select my_company_open_balance_cents() n')).rows[0].n;
  assert.equal(bal, 0);
});
test('2: staff still read rates', async () => {
  const s = (await q(`select user_id from staff limit 1`)).rows[0]?.user_id;
  if (!s) return;
  assert.ok((await as('authenticated', s, 'select * from current_class_rates')).rowCount > 0);
});
test('12: audit log actor must be self', async () => {
  const s = (await q(`select user_id from staff limit 1`)).rows[0]?.user_id;
  if (!s) return;
  await err(as('authenticated', s, `insert into admin_activity (actor_id, action, entity) values (gen_random_uuid(),'x','y')`), /row-level security/);
});
test('P3: rates append-only for staff', async () => {
  const s = (await q(`select user_id from staff limit 1`)).rows[0]?.user_id;
  if (!s) return;
  await err(as('authenticated', s, `update class_rates set per_km=1`), /permission denied/);
});
test.after(() => db.drop());
