import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autocomplete, placeDetails, parsePlace, placeColumns, mapsDirectionsUrl, addressAnswer, cleanInput, PlacesError, PREFERRED_PLACE_TYPES } from '../src/index.mjs';

const KEY = 'test-key';
const TOKEN = '3f2c8a52-1b7e-4c3d-9a1f-2e6b7c8d9e0f';
const PID = 'ChIJ8UNwBh-9oRQR3Y1mdkU1Nic';
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const spy = (body) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => body }; }; f.calls = calls; return f; };

/** Snapshot of the default (distance pricing OFF) autocomplete request body. */
const DEFAULT_AUTOCOMPLETE_BODY = {
  input: 'hilton ath',
  sessionToken: TOKEN,
  includedRegionCodes: ['gr'],
  languageCode: 'en',
  locationBias: {
    circle: { center: { latitude: 37.9838, longitude: 23.7275 }, radius: 50000 },
  },
};

test('autocomplete sends one POST with session token, Greece only, Athens bias and the key in a header', async () => {
  const f = spy({ suggestions: [{ placePrediction: { placeId: PID, text: { text: 'Hilton Athens, Vasilissis Sofias 46, Athens, Greece' },
    structuredFormat: { mainText: { text: 'Hilton Athens' }, secondaryText: { text: 'Vasilissis Sofias 46, Athens, Greece' } } } }] });
  const r = await autocomplete({ input: '  hilton   ath ', sessionToken: TOKEN, apiKey: KEY, fetch: f });
  assert.deepEqual(r, [{ placeId: PID, label: 'Hilton Athens, Vasilissis Sofias 46, Athens, Greece', main: 'Hilton Athens', secondary: 'Vasilissis Sofias 46, Athens, Greece' }]);
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://places.googleapis.com/v1/places:autocomplete');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['X-Goog-Api-Key'], KEY);
  const body = JSON.parse(init.body);
  assert.deepEqual(body, DEFAULT_AUTOCOMPLETE_BODY);
  assert.ok(!('locationRestriction' in body));
  assert.ok(!url.includes(KEY), 'key never in the URL');
});

test('autocomplete with locationRestriction uses Attica rectangle (no bias) and prefers airports/ports/hotels first', async () => {
  const rect = {
    low: { latitude: 37.64, longitude: 23.3 },
    high: { latitude: 38.35, longitude: 24.08 },
  };
  const sug = {
    suggestions: [
      {
        placePrediction: {
          placeId: PID,
          text: { text: 'Athens Airport' },
          structuredFormat: { mainText: { text: 'Athens Airport' }, secondaryText: { text: 'Spata' } },
        },
      },
    ],
  };
  const f = spy(sug);
  await autocomplete({
    input: 'airport',
    sessionToken: TOKEN,
    apiKey: KEY,
    locationRestriction: rect,
    preferPrimaryTypes: PREFERRED_PLACE_TYPES,
    fetch: f,
  });
  assert.equal(f.calls.length, 1);
  const body = JSON.parse(f.calls[0].init.body);
  assert.deepEqual(body.locationRestriction, { rectangle: rect });
  assert.ok(!('locationBias' in body));
  assert.deepEqual(body.includedPrimaryTypes, PREFERRED_PLACE_TYPES);
  assert.deepEqual(body.includedRegionCodes, ['gr']);
});

test('autocomplete falls back to all types when preferred types return nothing', async () => {
  const calls = [];
  const f = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const empty = calls.length === 1;
    return {
      ok: true,
      status: 200,
      json: async () =>
        empty
          ? { suggestions: [] }
          : {
              suggestions: [
                {
                  placePrediction: {
                    placeId: PID,
                    text: { text: 'Somewhere' },
                    structuredFormat: { mainText: { text: 'Somewhere' }, secondaryText: { text: '' } },
                  },
                },
              ],
            },
    };
  };
  const r = await autocomplete({
    input: 'athens',
    sessionToken: TOKEN,
    apiKey: KEY,
    preferPrimaryTypes: PREFERRED_PLACE_TYPES,
    fetch: f,
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includedPrimaryTypes);
  assert.ok(!('includedPrimaryTypes' in calls[1]));
  assert.equal(r[0].main, 'Somewhere');
});

test('autocomplete: fewer than 3 letters makes no call; at most 5 suggestions; query predictions are skipped', async () => {
  const f = spy({});
  assert.deepEqual(await autocomplete({ input: 'hi', sessionToken: TOKEN, apiKey: KEY, fetch: f }), []);
  assert.equal(f.calls.length, 0);
  const many = { suggestions: [{ queryPrediction: { text: { text: 'x' } } }, ...Array.from({ length: 8 }, (_, i) => ({ placePrediction: { placeId: `${PID}${i}`, text: { text: `P${i}` } } }))] };
  const r = await autocomplete({ input: 'athens', sessionToken: TOKEN, apiKey: KEY, fetch: ok(many) });
  assert.equal(r.length, 5);
  assert.equal(r[0].main, 'P0');
});

test('autocomplete refuses bad input and session tokens before calling Google', async () => {
  const f = spy({});
  await assert.rejects(autocomplete({ input: 'athens', sessionToken: 'abc', apiKey: KEY, fetch: f }), (e) => e.code === 'invalid_request');
  await assert.rejects(autocomplete({ input: 'x'.repeat(121), sessionToken: TOKEN, apiKey: KEY, fetch: f }), (e) => e.code === 'invalid_request');
  await assert.rejects(autocomplete({ input: 'athens', sessionToken: TOKEN, apiKey: '', fetch: f }), (e) => e.code === 'places_unavailable');
  assert.equal(f.calls.length, 0);
});

test('Google errors and timeouts become places_unavailable (the form keeps working as free text)', async () => {
  await assert.rejects(autocomplete({ input: 'athens', sessionToken: TOKEN, apiKey: KEY, fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }) }), (e) => e.code === 'places_unavailable');
  await assert.rejects(autocomplete({ input: 'athens', sessionToken: TOKEN, apiKey: KEY, fetch: async () => { throw new Error('timeout'); } }), (e) => e.code === 'places_unavailable');
});

test('placeDetails asks only id, formattedAddress, location (Essentials) with the same session token', async () => {
  const f = spy({ id: PID, formattedAddress: 'Vasilissis Sofias 46, Athina 115 28, Greece', location: { latitude: 37.9767, longitude: 23.7503 } });
  const r = await placeDetails({ placeId: PID, sessionToken: TOKEN, apiKey: KEY, fetch: f });
  assert.deepEqual(r, { placeId: PID, address: 'Vasilissis Sofias 46, Athina 115 28, Greece', lat: 37.9767, lng: 23.7503 });
  const { url, init } = f.calls[0];
  assert.ok(url.startsWith(`https://places.googleapis.com/v1/places/${PID}?sessionToken=${TOKEN}`));
  assert.equal(init.headers['X-Goog-FieldMask'], 'id,formattedAddress,location');
});

test('placeDetails refuses places outside Greece', async () => {
  await assert.rejects(placeDetails({ placeId: PID, sessionToken: TOKEN, apiKey: KEY, fetch: ok({ id: PID, formattedAddress: 'Paris', location: { latitude: 48.85, longitude: 2.35 } }) }), (e) => e.code === 'outside_area');
});

test('parsePlace: absent is fine, wrong is refused; placeColumns maps to the 0017 columns', () => {
  assert.equal(parsePlace(undefined), null);
  assert.deepEqual(parsePlace({ placeId: PID, lat: '37.9767', lng: 23.7503 }), { placeId: PID, lat: 37.9767, lng: 23.7503 });
  assert.throws(() => parsePlace({ placeId: PID, lat: 48.8, lng: 2.3 }), PlacesError);
  assert.throws(() => parsePlace({ placeId: 'x', lat: 37.9, lng: 23.7 }), PlacesError);
  assert.throws(() => parsePlace('ChIJ'), PlacesError);
  assert.deepEqual(placeColumns('pickup', { placeId: PID, lat: 1, lng: 2 }), { pickup_place_id: PID, pickup_lat: 1, pickup_lng: 2 });
  assert.deepEqual(placeColumns('dropoff', null), { dropoff_place_id: null, dropoff_lat: null, dropoff_lng: null });
});

test('Maps links: exact place when picked, typed text otherwise; no key in either', () => {
  const exact = new URL(mapsDirectionsUrl({ address: 'Hilton', placeId: PID, lat: 37.9767, lng: 23.7503 }));
  assert.equal(exact.origin + exact.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(exact.searchParams.get('api'), '1');
  assert.equal(exact.searchParams.get('destination'), '37.9767,23.7503');
  assert.equal(exact.searchParams.get('destination_place_id'), PID);
  const typed = new URL(mapsDirectionsUrl({ address: 'Terminal 2, door 3' }));
  assert.equal(typed.searchParams.get('destination'), 'Terminal 2, door 3');
  assert.equal(typed.searchParams.get('destination_place_id'), null);
  assert.match(addressAnswer('Hilton', { placeId: PID, lat: 37.9767, lng: 23.7503 }), /Google Maps: https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(addressAnswer('Typed', null), 'Typed');
});

test('cleanInput collapses spaces and returns null below 3 letters', () => {
  assert.equal(cleanInput('  a  b '), 'a b');
  assert.equal(cleanInput('ab'), null);
});
