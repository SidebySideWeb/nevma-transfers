// 0024: route_cache unique key and TTL query.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, asRole } from './harness.mjs';

let db;
const q = (sql, p) => db.pool.query(sql, p).then((r) => r.rows);

before(async () => {
  db = await createTestDb();
});
after(async () => db && db.drop());

test('route_cache enforces unique cache_key', async () => {
  await q(
    `insert into route_cache (cache_key, distance_km, duration_min, expires_at)
     values ('a|b||', 10.5, 20, now() + interval '1 day')`,
  );
  await assert.rejects(
    q(
      `insert into route_cache (cache_key, distance_km, duration_min, expires_at)
       values ('a|b||', 11.0, 21, now() + interval '1 day')`,
    ),
    (e) => e.code === '23505',
  );
});

test('TTL query returns only unexpired rows', async () => {
  await q(`delete from route_cache`);
  await q(
    `insert into route_cache (cache_key, distance_km, duration_min, expires_at) values
     ('fresh', 1.0, 5, now() + interval '1 hour'),
     ('stale', 2.0, 6, now() - interval '1 minute')`,
  );
  const rows = await q(
    `select cache_key, distance_km, duration_min from route_cache where expires_at > now() order by cache_key`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cache_key, 'fresh');
  assert.equal(Number(rows[0].distance_km), 1);
});

test('anon and authenticated cannot read route_cache', async () => {
  await q(
    `insert into route_cache (cache_key, distance_km, duration_min, expires_at)
     values ('secret', 3.0, 7, now() + interval '1 day')
     on conflict (cache_key) do nothing`,
  );
  // revoke all → permission denied (42501), same as rate_limits; not empty RLS rows.
  await asRole(db.pool, 'anon', null, async (c) => {
    await assert.rejects(c.query(`select * from route_cache`), (e) => e.code === '42501');
  });
  await asRole(db.pool, 'authenticated', '00000000-0000-4000-8000-0000000000bb', async (c) => {
    await assert.rejects(c.query(`select * from route_cache`), (e) => e.code === '42501');
  });
});
