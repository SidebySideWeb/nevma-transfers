import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let db;

before(async () => { db = await createTestDb({ seed: true }); });
after(async () => db && db.drop());

test('DEMO seed applies and every row is labelled', async () => {
  const q = async (sql) => (await db.pool.query(sql)).rows;
  for (const r of await q(`select name from zones`)) assert.match(r.name, /^DEMO /);
  for (const r of await q(`select key, name from vehicle_classes`)) { assert.match(r.key, /^demo-/); assert.match(r.name, /^DEMO /); }
  for (const r of await q(`select name from extras`)) assert.match(r.name, /^DEMO /);
  for (const r of await q(`select label from vehicles`)) assert.match(r.label, /^DEMO /);
  assert.equal((await q(`select count(*)::int n from zone_routes`))[0].n, 12);
  assert.equal((await q(`select count(*)::int n from zone_prices`))[0].n, 59); // 12 routes x 5 classes, minus one on purpose
  assert.deepEqual((await q(`select code from extras order by code`)).map((r) => r.code), ['night-surcharge', 'vip-security']);
});

test('DEMO seed keeps one priceless pair to exercise no_price', async () => {
  const r = await db.pool.query(`select count(*)::int n from zone_prices p
    join zones a on a.id = p.from_zone_id join zones b on b.id = p.to_zone_id join vehicle_classes c on c.id = p.class_id
    where a.code = 'demo-north' and b.code = 'demo-port' and c.key = 'demo-sprinter'`);
  assert.equal(r.rows[0].n, 0);
});

test('AC-32 Sanity seed route zone codes all exist in the database', async () => {
  const zones = new Set((await db.pool.query(`select code from zones`)).rows.map((r) => r.code));
  const ndjson = readFileSync(join(root, 'seed', 'sanity', 'data.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const routes = ndjson.filter((d) => d._type === 'route');
  assert.ok(routes.length >= 4);
  for (const r of routes) {
    assert.ok(zones.has(r.fromZone), r.fromZone);
    assert.ok(zones.has(r.toZone), r.toZone);
    const route = await db.pool.query(`select 1 from zone_routes zr join zones a on a.id = zr.from_zone_id join zones b on b.id = zr.to_zone_id where a.code = $1 and b.code = $2`, [r.fromZone, r.toZone]);
    assert.equal(route.rowCount, 1, `${r.fromZone} -> ${r.toZone} has a route`);
  }
});

test('Sanity seed vehicle class keys match the database keys exactly', async () => {
  const sqlKeys = (await db.pool.query(`select key from vehicle_classes order by key`)).rows.map((r) => r.key);
  const ndjson = readFileSync(join(root, 'seed', 'sanity', 'data.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const sanityKeys = ndjson.filter((d) => d._type === 'vehicleClass').map((d) => d.key).sort();
  assert.deepEqual(sanityKeys, sqlKeys);
});
