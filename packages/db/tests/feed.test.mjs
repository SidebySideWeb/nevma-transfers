// Fleet and pricing feed import (data/fleet-feed.json → Postgres). Needs 0014.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, asRole } from './harness.mjs';
import { importFeed } from '../scripts/import-fleet-feed.mjs';
import { loadFeed } from '../scripts/fleet-feed-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const feed = loadFeed(join(root, 'data', 'fleet-feed.json'));
let db;
const staffId = '00000000-0000-4000-8000-0000000000f1';
const one = async (sql, p) => (await db.pool.query(sql, p)).rows[0];

async function inTx(fn) {
  const c = await db.pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback'); throw e; }
  finally { c.release(); }
}

before(async () => {
  db = await createTestDb({ seed: true });
  await db.pool.query(`insert into staff (user_id, email) values ($1, 'office@example.com')`, [staffId]);
});
after(async () => db && db.drop());

test('import: classes, zones, routes both ways, final prices (+24% VAT), hourly, extras, vehicles, settings', async () => {
  const demoClasses = (await one(`select count(*)::int n from vehicle_classes where active`)).n; // the kit's demo seed
  const report = await inTx((c) => importFeed(c, feed));
  assert.equal(report.changes['classes added'], 5);
  assert.equal(report.changes['classes switched offline (not in the feed)'], demoClasses);
  assert.equal(report.changes['prices added'], 70);
  assert.equal(report.changes['routes added'], 14);
  assert.ok(report.warnings.some((w) => /before VAT/.test(w)));
  assert.ok(report.warnings.some((w) => /booking_reference_format/.test(w)));
  const p = await one(`select zp.price_cents, zp.is_demo from zone_prices zp join zones a on a.id = zp.from_zone_id join zones b on b.id = zp.to_zone_id
                       join vehicle_classes c on c.id = zp.class_id where a.code = 'ath-airport' and b.code = 'athens-centre' and c.key = 'v-class'`);
  assert.deepEqual(p, { price_cents: 22320, is_demo: false });            // €180 + 24% = €223.20
  const back = await one(`select price_cents from zone_prices zp join zones a on a.id = zp.from_zone_id join zones b on b.id = zp.to_zone_id
                          join vehicle_classes c on c.id = zp.class_id where a.code = 'athens-centre' and b.code = 'ath-airport' and c.key = 'vito'`);
  assert.equal(back.price_cents, 18600);
  assert.deepEqual(await one(`select price_per_hour_cents, min_hours, max_hours from hourly_rates h join vehicle_classes c on c.id = h.class_id where c.key = 'e-class'`),
    { price_per_hour_cents: 7440, min_hours: 3, max_hours: 12 });
  assert.deepEqual(await one(`select max_quantity, applies_to, price_cents from extras where code = 'child-seat'`), { max_quantity: 3, applies_to: ['transfer', 'hourly'], price_cents: 1240 });
  assert.deepEqual(await one(`select active, price_cents, is_demo from extras where code = 'vip-security'`), { active: true, price_cents: 0, is_demo: true });
  assert.equal((await one(`select count(*)::int n from vehicles where is_demo and label like '%#%'`)).n, 8);
  assert.deepEqual(await one(`select value, is_demo from settings where key = 'cancel_window_hours'`), { value: 48, is_demo: true });
  assert.equal((await one(`select kind from zones where code = 'piraeus-port'`)).kind, 'port');
  assert.equal((await one(`select count(*)::int n from vehicle_classes where active`)).n, 5);
});

test('import is idempotent: a second run changes nothing', async () => {
  const report = await inTx((c) => importFeed(c, feed));
  assert.deepEqual(report.changes, {});
});

test('a price removed from the feed is removed from the database; a changed price is updated', async () => {
  const f = structuredClone(feed);
  f.zone_prices = f.zone_prices.filter((p) => !(p.from_zone === 'athens-centre' && p.to_zone === 'athens-north' && p.class_key === 'sprinter'));
  f.zone_prices.find((p) => p.from_zone === 'ath-airport' && p.to_zone === 'athens-centre' && p.class_key === 'e-class').price_cents = 16000;
  const report = await inTx((c) => importFeed(c, f));
  assert.equal(report.changes['prices removed (not in the feed)'], 2);
  assert.equal(report.changes['prices changed'], 2);
  await inTx((c) => importFeed(c, feed)); // back to the feed
});

test('an invalid feed is refused and nothing is written', async () => {
  const f = structuredClone(feed);
  f.zone_prices.push({ from_zone: 'ath-airport', to_zone: 'athens-centre', class_key: 'limo', price_cents: 1, demo: true });
  f.vehicles.push({ label: 'v-class #1', class_key: 'v-class' });
  await assert.rejects(inTx((c) => importFeed(c, f)), (e) => e.feedErrors.some((m) => /unknown class "limo"/.test(m)) && e.feedErrors.some((m) => /appears twice/.test(m)));
  assert.equal((await one(`select count(*)::int n from zone_prices zp join vehicle_classes c on c.id = zp.class_id where c.key = 'limo'`)).n, 0);
});

test('--retire-missing-vehicles retires the demo vehicles; the DEMO rows view lists what blocks launch', async () => {
  const others = (await one(`select count(*)::int n from vehicles where status <> 'retired' and label not like '%#%'`)).n; // the kit's demo vehicles
  const report = await inTx((c) => importFeed(c, feed, { retireMissingVehicles: true }));
  assert.equal(report.changes['vehicles retired (not in the feed)'], others);
  const rows = await asRole(db.pool, 'authenticated', staffId, async (c) => Object.fromEntries((await c.query(`select table_name, n from demo_rows`)).rows.map((r) => [r.table_name, r.n])));
  assert.equal(rows.vehicle_classes, 5);
  assert.equal(rows.vehicles, 8);
  assert.equal(rows.zone_prices, 60);   // 70 minus the 10 airport ↔ Athens prices from the price list
  assert.equal(rows.hourly_rates, 0);
  const n = await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000f2', async (c) => (await c.query(`select sum(n)::int s from demo_rows`)).rows[0].s);
  assert.equal(n, 0);
});
