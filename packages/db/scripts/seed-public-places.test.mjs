import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateEntry, searchBody, parsePlace, rowFor, KINDS, ATTICA } from './seed-public-places.mjs';

const list = JSON.parse(await readFile(new URL('./public-places.json', import.meta.url), 'utf8')).places;

test('every starter entry is valid, public and unique', () => {
  for (const e of list) assert.equal(validateEntry(e), null, e.label);
  assert.ok(list.length >= 40);
  assert.equal(new Set(list.map((e) => e.label)).size, list.length);
  assert.ok(list.every((e) => e.kind !== 'address'));
  for (const k of ['airport', 'port', 'landmark', 'square', 'hotel']) assert.ok(list.some((e) => e.kind === k), k);
  assert.ok(list.some((e) => e.label.includes('Sounio')) && list.some((e) => e.label === 'Acropolis'));
});

test('a private address can never be seeded', () => {
  assert.match(validateEntry({ query: 'Odos Example 4', label: 'Villa', kind: 'address' }), /never "address"/);
  assert.ok(!KINDS.includes('address'));
});

test('search is restricted to Attica, one result, English', () => {
  const b = searchBody('Acropolis of Athens');
  assert.equal(b.pageSize, 1); assert.equal(b.regionCode, 'GR'); assert.equal(b.languageCode, 'en');
  assert.deepEqual(b.locationRestriction.rectangle, ATTICA);
});

test('parse a Google answer into a public row', () => {
  const found = parsePlace({ places: [{ id: 'ChIJacr', displayName: { text: 'Acropolis of Athens' },
    formattedAddress: 'Athens 105 58, Greece', location: { latitude: 37.9715, longitude: 23.7257 } }] });
  assert.equal(found.placeId, 'ChIJacr');
  const row = rowFor({ label: 'Acropolis', kind: 'landmark', pinned: true }, found);
  assert.deepEqual(row, { label: 'Acropolis', address: 'Athens 105 58, Greece', place_id: 'ChIJacr',
    lat: 37.9715, lng: 23.7257, kind: 'landmark', is_public: true, pinned: true, hidden: false, source: 'office' });
  assert.equal(parsePlace({ places: [] }), null);
  assert.equal(parsePlace({ places: [{ id: 'x', location: { latitude: 48.85, longitude: 2.35 } }] }), null);   // not Greece
});
