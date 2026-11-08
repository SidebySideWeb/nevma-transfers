import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';

// 0033: popular routes for the booking widget (B4b).
const db = await createTestDb({ seed: true });
const q = (s, p) => db.pool.query(s, p);

async function place(code, addr, lat, lng, kind) {
  await q(`update zones set display_address=$2, display_place_id=$3, display_lat=$4, display_lng=$5, display_kind=$6 where code=$1`,
    [code, addr, 'ChIJ' + code.replace(/-/g, ''), lat, lng, kind]);
}
async function feature(from, to, order) {
  await q(`update zone_routes set featured=true, featured_order=$3
            where from_zone_id=(select id from zones where code=$1) and to_zone_id=(select id from zones where code=$2)`, [from, to, order]);
}

test('a featured route with display places is listed with its lowest class price', async () => {
  await place('demo-airport', 'Athens International Airport (ATH)', 37.9364, 23.9445, 'airport');
  await place('demo-centre', 'Syntagma Square, Athens', 37.9755, 23.7348, 'area');
  await feature('demo-airport', 'demo-centre', 1);
  const r = await q(`select * from featured_routes where from_code='demo-airport' and to_code='demo-centre'`);
  assert.equal(r.rowCount, 1);
  const min = (await q(`select min(p.price_cents)::int m from zone_prices p join vehicle_classes c on c.id=p.class_id and c.active
     where p.from_zone_id=(select id from zones where code='demo-airport') and p.to_zone_id=(select id from zones where code='demo-centre') and p.price_cents>0`)).rows[0].m;
  assert.equal(r.rows[0].from_price_cents, min);
  assert.equal(r.rows[0].from_kind, 'airport');
});

test('routes are hidden when not featured, when a zone has no display place, or when nothing is priced', async () => {
  await feature('demo-airport', 'demo-port', 2);              // demo-port has no display place
  const r = await q(`select count(*)::int n from featured_routes where to_code='demo-port'`);
  assert.equal(r.rows[0].n, 0);
  await q(`update zone_prices set price_cents=0 where from_zone_id=(select id from zones where code='demo-airport')
            and to_zone_id=(select id from zones where code='demo-centre')`);
  assert.equal((await q(`select count(*)::int n from featured_routes where to_code='demo-centre'`)).rows[0].n, 0);
});

test('display place is all or nothing and must be in Greece', async () => {
  await assert.rejects(q(`update zones set display_place_id='ChIJx', display_lat=null where code='demo-north'`), /zones_display_place_ck/);
  await assert.rejects(q(`update zones set display_address='x', display_place_id='ChIJx', display_lat=48.85, display_lng=2.35 where code='demo-north'`), /zones_display_place_ck/);
  await assert.rejects(q(`update zones set display_kind='castle' where code='demo-north'`), /zones_display_kind_ck/);
});

test('anon cannot read the view; signed-in non-staff see nothing', async () => {
  const c = await db.pool.connect();
  try {
    await c.query('begin'); await c.query('set local role anon');
    await assert.rejects(c.query('select * from featured_routes'), /permission denied/);
    await c.query('rollback');
    await c.query('begin'); await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000dd',true)`);
    assert.equal((await c.query('select * from featured_routes')).rowCount, 0);
    await c.query('rollback');
  } finally { c.release(); }
});

test.after(() => db.drop());
