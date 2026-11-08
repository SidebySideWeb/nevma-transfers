import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';

// 0034: zone areas, optional long-distance / quote-only settings, quote_failures.
const db = await createTestDb({ seed: true });
const q = (s, p) => db.pool.query(s, p);
const box = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

test('a zone area must be a closed GeoJSON polygon inside Greece', async () => {
  await q(`update zones set area=$1 where code='demo-centre'`, [box(23.70, 37.96, 23.76, 38.00)]);
  await assert.rejects(q(`update zones set area=$1 where code='demo-north'`,
    [{ type: 'Polygon', coordinates: [[[23.7, 37.9], [23.8, 37.9], [23.8, 38.0]]] }]), /zones_area_ck/);   // not closed, 3 points
  await assert.rejects(q(`update zones set area=$1 where code='demo-north'`, [box(2.30, 48.80, 2.40, 48.90)]), /zones_area_ck/);  // Paris
  await assert.rejects(q(`update zones set area=$1 where code='demo-north'`, [{ type: 'Point', coordinates: [23.7, 37.9] }]), /zones_area_ck/);
  await q(`update zones set area=null where code='demo-north'`);  // null is allowed: never matches
});

test('the current settings gain long_distance and quote_only_over_km, switched off, other values kept', async () => {
  const s = (await q(`select doc from current_pricing_settings`)).rows[0].doc;
  assert.ok('long_distance' in s && s.long_distance === null);
  assert.ok('quote_only_over_km' in s && s.quote_only_over_km === null);
  assert.equal(s.quote_ttl_min, 20);
});

test('optional keys are validated when set', async () => {
  const base = (await q(`select doc from current_pricing_settings`)).rows[0].doc;
  await q(`insert into pricing_settings (doc) values ($1)`, [{ ...base, long_distance: { over_km: 40, factor: 1.1 }, quote_only_over_km: 80 }]);
  await assert.rejects(q(`insert into pricing_settings (doc) values ($1)`, [{ ...base, long_distance: { over_km: 0, factor: 1.1 } }]), /pricing_settings_doc_check/);
  await assert.rejects(q(`insert into pricing_settings (doc) values ($1)`, [{ ...base, long_distance: { over_km: 40, factor: 0.9 } }]), /pricing_settings_doc_check/);
  await assert.rejects(q(`insert into pricing_settings (doc) values ($1)`, [{ ...base, quote_only_over_km: 'far' }]), /pricing_settings_doc_check/);
  await assert.rejects(q(`insert into pricing_settings (doc) values ($1)`, [{ ...base, rounding: '5' }]), /pricing_settings_doc_check/);
});

test('quote failures: known reasons only; anon none; staff read', async () => {
  await q(`insert into quote_failures (http_status, reason, detail, request) values (422, 'outside_area', 'dropoff', '{"pickup":[37.95,23.70]}')`);
  await assert.rejects(q(`insert into quote_failures (http_status, reason) values (409, 'zones_missing')`), /check/);
  const c = await db.pool.connect();
  try {
    await c.query('begin'); await c.query('set local role anon');
    await assert.rejects(c.query('select * from quote_failures'), /permission denied/);
    await c.query('rollback');
    await c.query('begin'); await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000ee',true)`);
    assert.equal((await c.query('select * from quote_failures')).rowCount, 0);   // not staff
    await c.query('rollback');
  } finally { c.release(); }
});

test.after(() => db.drop());
