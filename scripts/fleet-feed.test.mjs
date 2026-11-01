// Pure checks of the fleet feed conversion (no database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFeed, validateFeed, finalCents, toDbRows, toSanityDocs, brand } from '../packages/db/scripts/fleet-feed-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feed = loadFeed(join(root, 'data', 'fleet-feed.json'));

test('the repo feed is valid; notes cover VAT and the old reference format', () => {
  const { errors, warnings } = validateFeed(feed);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => /before VAT/.test(w)));
});

test('prices before VAT become final prices; included prices stay', () => {
  assert.equal(finalCents(18000, 24, false), 22320);
  assert.equal(finalCents(15000, 24, false), 18600);
  assert.equal(finalCents(1, 24, false), 1);
  assert.equal(finalCents(18000, 24, true), 18000);
});

test('rows: both directions expanded, settings mapped', () => {
  const r = toDbRows(feed);
  assert.equal(r.routes.length, 14);
  assert.equal(r.prices.length, 70);
  assert.deepEqual(r.settings.map((s) => s.key).sort(), ['cancel_window_hours', 'hold_minutes', 'min_lead_minutes', 'vat_rate_bp']);
  assert.equal(r.settings.find((s) => s.key === 'vat_rate_bp').value, 2400);
});

test('Sanity content: one document per class, hero image first, Elite Protection in SEO, every image file exists', async () => {
  const { existsSync } = await import('node:fs');
  const docs = toSanityDocs(feed);
  assert.equal(docs.length, 5);
  const v = docs.find((d) => d.key === 'v-class');
  assert.equal(v._id, 'vehicleClass-v-class');
  assert.equal(v.images[0].file, 'v-class-street.jpg');
  assert.match(v.set.seo.title, /Elite Protection$/);
  assert.equal(v.set.group, 'van');
  for (const d of docs) for (const i of d.images) assert.ok(existsSync(join(root, 'data', 'fleet-images', i.file)), i.file);
  assert.equal(brand('X | TEM Protection'), 'X | Elite Protection');
});

test('validation catches broken references', () => {
  const f = structuredClone(feed);
  f.zone_prices[0].class_key = 'limo';
  f.zones[0].type = 'beach';
  const { errors } = validateFeed(f);
  assert.ok(errors.some((e) => /unknown class "limo"/.test(e)));
  assert.ok(errors.some((e) => /type must be one of/.test(e)));
});
