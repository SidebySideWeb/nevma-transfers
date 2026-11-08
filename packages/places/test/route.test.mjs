import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  route,
  routeCacheKey,
  roundDepartAt,
  RouteUnavailable,
  __resetRouteCacheForTests,
} from '../src/index.mjs';

const KEY = 'maps-server-key';
const ORIGIN = { lat: 37.9755, lng: 23.7348 };
const DEST = { lat: 37.9364, lng: 23.9445 };

beforeEach(() => __resetRouteCacheForTests());

function spy(body, { status = 200, ok = true, failTimes = 0 } = {}) {
  const calls = [];
  let fails = failTimes;
  const f = async (url, init) => {
    calls.push({ url, init });
    if (fails > 0) {
      fails -= 1;
      throw new Error('timeout');
    }
    return { ok, status, json: async () => body };
  };
  f.calls = calls;
  return f;
}

test('route sends computeRoutes with DRIVE; future departureTime uses TRAFFIC_AWARE', async () => {
  const departAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const f = spy({ routes: [{ distanceMeters: 35421, duration: '2345s' }] });
  const r = await route({
    origin: ORIGIN,
    destination: DEST,
    stops: [{ lat: 37.95, lng: 23.8 }],
    departAt,
    apiKey: KEY,
    fetch: f,
  });
  assert.deepEqual(r, { distanceKm: 35.4, durationMin: 40, source: 'google' });
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(init.headers['X-Goog-Api-Key'], KEY);
  assert.equal(init.headers['X-Goog-FieldMask'], 'routes.distanceMeters,routes.duration');
  const body = JSON.parse(init.body);
  assert.equal(body.travelMode, 'DRIVE');
  assert.equal(body.routingPreference, 'TRAFFIC_AWARE');
  assert.equal(body.departureTime, departAt);
  assert.equal(body.origin.location.latLng.latitude, ORIGIN.lat);
  assert.equal(body.destination.location.latLng.longitude, DEST.lng);
  assert.equal(body.intermediates.length, 1);
});

test('route without departAt stays TRAFFIC_UNAWARE and omits departureTime', async () => {
  const f = spy({ routes: [{ distanceMeters: 1000, duration: '60s' }] });
  await route({ origin: ORIGIN, destination: DEST, apiKey: KEY, fetch: f });
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.routingPreference, 'TRAFFIC_UNAWARE');
  assert.equal(body.departureTime, undefined);
});

test('route rounds distance to 1 decimal and duration up to whole minutes', async () => {
  const f = spy({ routes: [{ distanceMeters: 10050, duration: '61s' }] });
  const r = await route({ origin: ORIGIN, destination: DEST, apiKey: KEY, fetch: f });
  assert.equal(r.distanceKm, 10.1);
  assert.equal(r.durationMin, 2);
});

test('route cache: second call makes no fetch', async () => {
  const f = spy({ routes: [{ distanceMeters: 1000, duration: '60s' }] });
  const a = await route({ origin: ORIGIN, destination: DEST, apiKey: KEY, fetch: f });
  const b = await route({ origin: ORIGIN, destination: DEST, apiKey: KEY, fetch: f });
  assert.deepEqual(a, b);
  assert.equal(f.calls.length, 1);
  assert.equal(
    routeCacheKey(ORIGIN, DEST),
    routeCacheKey(
      { lat: ORIGIN.lat + 0.000001, lng: ORIGIN.lng },
      { lat: DEST.lat, lng: DEST.lng },
    ),
  );
});

test('timeout then retry; both fail → RouteUnavailable', async () => {
  const f = spy({}, { failTimes: 2 });
  await assert.rejects(
    route({ origin: ORIGIN, destination: DEST, apiKey: KEY, fetch: f }),
    (e) => e instanceof RouteUnavailable && e.code === 'route_unavailable',
  );
  assert.equal(f.calls.length, 2);
});

test('one timeout then success uses the retry', async () => {
  const f = spy({ routes: [{ distanceMeters: 500, duration: '30s' }] }, { failTimes: 1 });
  const r = await route({ origin: ORIGIN, destination: DEST, apiKey: KEY, fetch: f });
  assert.equal(r.distanceKm, 0.5);
  assert.equal(r.durationMin, 1);
  assert.equal(f.calls.length, 2);
});

test('past departureTime is omitted from the request body', async () => {
  const f = spy({ routes: [{ distanceMeters: 100, duration: '10s' }] });
  await route({
    origin: ORIGIN,
    destination: DEST,
    departAt: new Date(Date.now() - 60_000).toISOString(),
    apiKey: KEY,
    fetch: f,
  });
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.departureTime, undefined);
});

test('roundDepartAt snaps to 15 minutes', () => {
  assert.equal(roundDepartAt('2026-11-07T10:07:00.000Z'), '2026-11-07T10:00:00.000Z');
  assert.equal(roundDepartAt('2026-11-07T10:14:59.000Z'), '2026-11-07T10:00:00.000Z');
  assert.equal(roundDepartAt('2026-11-07T10:15:00.000Z'), '2026-11-07T10:15:00.000Z');
});
