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
  assert.equal((await q(`select count(*)::int n from zone_prices`))[0].n, 35); // 12 routes x 3 classes, minus one on purpose
  assert.deepEqual((await q(`select code from extras order by code`)).map((r) => r.code), ['night-surcharge', 'vip-security']);
});

test('DEMO seed keeps one priceless pair to exercise no_price', async () => {
  const r = await db.pool.query(`select count(*)::int n from zone_prices p
    join zones a on a.id = p.from_zone_id join zones b on b.id = p.to_zone_id join vehicle_classes c on c.id = p.class_id
    where a.code = 'demo-north' and b.code = 'demo-port' and c.key = 'demo-van'`);
  assert.equal(r.rows[0].n, 0);
});

test('Sanity seed vehicle class keys match the database keys exactly', async () => {
  const sqlKeys = (await db.pool.query(`select key from vehicle_classes order by key`)).rows.map((r) => r.key);
  const ndjson = readFileSync(join(root, 'seed', 'sanity', 'data.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const sanityKeys = ndjson.filter((d) => d._type === 'vehicleClass').map((d) => d.key).sort();
  assert.deepEqual(sanityKeys, sqlKeys);
});
