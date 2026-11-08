import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { __resetRouteCacheForTests } from '@tem/places';
import { hasDatabaseUrl } from '../../test/has-database';
import { quote, setSanityVehicleClasses } from './booking-service';
import { dbFromPool, setBookingDb } from './db';
import { fail } from './http';
import { clearSettingsCache } from './settings';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// FIX-2 (PRICING_MODE=distance). CR-3 (flat fare, hybrid) is skipped by owner decision.
const KALLITHEA = { placeId: 'ChIJkallithea0001', lat: 37.9516513, lng: 23.7095878, address: 'Hilton Garden Inn, Kallithea' };
const SOUNIO = { placeId: 'ChIJsounio0000001', lat: 37.6870154, lng: 24.0523991, address: 'Sounio Poseidon Villa' };
const SYNTAGMA = { placeId: 'ChIJsyntagma00001', lat: 37.9755, lng: 23.7348 };
const GLYFADA = { lat: 37.8758, lng: 23.7464 }; // inside no zone area, no placeId
const CORINTH = { placeId: 'ChIJcorinth0000001', lat: 37.9407, lng: 22.9322 };

/** Athens wall clock `YYYY-MM-DDTHH:mm`, `hours` from now, snapped to 12:00 when `noon`. */
function athens(hours: number, noon = false): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(Date.now() + hours * 3_600_000));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${noon ? '12:00' : `${g('hour')}:${g('minute')}`}`;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

describe.skipIf(!hasDatabaseUrl)('FIX-2 distance-first quotes', () => {
  let db: TestDb;
  let googleMode: 'ok' | 'timeout';
  let googleCalls: number;
  const ip = '203.0.113.77';
  const day2 = athens(48, true);
  const day3 = athens(72, true);

  const base = (over: Record<string, unknown> = {}) => ({
    type: 'transfer',
    pickupLocal: day2,
    passengers: 2,
    luggage: 1,
    pickupPlace: KALLITHEA,
    dropoffPlace: SOUNIO,
    ...over,
  });
  const failure = async (p: Promise<unknown>) => {
    const err = await p.then(() => null, (e) => e);
    expect(err).toBeTruthy();
    const res = fail(err);
    return { status: res.status, body: (await res.json()) as { error: string; fields?: Record<string, string> } };
  };

  beforeEach(async () => {
    Object.assign(process.env, {
      PRICING_MODE: 'distance',
      FEATURE_DISTANCE_PRICING: 'true',
      FEATURE_RETURN_TRIP: 'true',
      GOOGLE_MAPS_SERVER_KEY: 'maps-test-key',
      QUOTE_SIGNING_SECRET: 'fix2-test-signing-secret',
    });
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    __resetRouteCacheForTests();
    setSanityVehicleClasses([{ key: 'demo-e-class', name: 'DEMO E' }]);
    await db.pool.query(
      `insert into public.class_rates (class_key, base_fare, per_km, per_min, minimum_fare)
       select key, 1500, 120, 30, 3000 from public.vehicle_classes`,
    );
    googleMode = 'ok';
    googleCalls = 0;
    // Google Routes mock: ~1.5 x straight line, 50 km/h.
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      googleCalls++;
      if (googleMode === 'timeout') throw new DOMException('timed out', 'TimeoutError');
      const b = JSON.parse(init.body) as Record<'origin' | 'destination', { location: { latLng: { latitude: number; longitude: number } } }>;
      const ll = (x: typeof b.origin) => ({ lat: x.location.latLng.latitude, lng: x.location.latLng.longitude });
      const km = haversineKm(ll(b.origin), ll(b.destination)) * 1.5;
      return new Response(
        JSON.stringify({ routes: [{ distanceMeters: Math.round(km * 1000), duration: `${Math.round((km / 50) * 3600)}s` }] }),
        { status: 200 },
      );
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const k of ['PRICING_MODE', 'FEATURE_DISTANCE_PRICING', 'FEATURE_RETURN_TRIP', 'GOOGLE_MAPS_SERVER_KEY', 'QUOTE_SIGNING_SECRET']) {
      delete process.env[k];
    }
    setBookingDb(null);
    setSanityVehicleClasses(null);
    clearSettingsCache();
    await db?.drop();
  });

  it('CR-1 Kallithea → Sounio one way: a distance price for each priced class, no zones stored', async () => {
    const q = await quote(base(), ip);
    expect(q.quoteId).toBeTruthy();
    expect(q.distanceKm).toBeGreaterThan(40);
    expect(q.options.length).toBeGreaterThan(0);
    for (const o of q.options) {
      expect(o.baseCents).toBeGreaterThan(0);
      expect(o.breakdown?.some((l) => l.code === 'distance')).toBe(true);
      expect(o.breakdown?.some((l) => l.code === 'fixed_route')).toBe(false);
    }
    const { rows } = await db.pool.query(
      `select from_zone_code, to_zone_code from public.quotes where id = $1`,
      [q.quoteId],
    );
    expect(rows[0]).toEqual({ from_zone_code: null, to_zone_code: null });
  });

  it('CR-2 same route with a return later than the outbound: outbound + return + total', async () => {
    const q = await quote(base({ return: { pickupLocal: day3 } }), ip);
    for (const o of q.options) {
      expect(o.outbound).toBeGreaterThan(0);
      expect(o.return).toBeGreaterThan(0);
      expect(o.total).toBe((o.outbound ?? 0) + (o.return ?? 0));
    }
    expect(googleCalls).toBe(2); // one route per leg
  });

  it('CR-4 a place in no zone area (and no placeId) still gets a distance price', async () => {
    const q = await quote(base({ pickupPlace: GLYFADA, dropoffPlace: SYNTAGMA }), ip);
    expect(q.options.every((o) => (o.baseCents ?? 0) > 0)).toBe(true);
    expect(q.quoteId).toBeTruthy();
  });

  it('CR-5 old clients that send zones are ignored (warned), and zones are not needed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withZones = await quote(base({ fromZone: 'ath-airport', toZone: 'athens-centre' }), ip);
    expect(withZones.quoteId).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('client sent zones'));
    const without = await quote(base(), ip);
    expect(without.quoteId).toBeTruthy();
  });

  it('CR-6 return earlier than the outbound → 400 return_before_outbound on the return field', async () => {
    const r = await failure(quote(base({ pickupLocal: day3, return: { pickupLocal: day2 } }), ip));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('return_before_outbound');
    expect(r.body.fields?.returnPickupLocal).toMatch(/later than the outbound/);
    expect(googleCalls).toBe(0); // checked before any Google call
    const { rows } = await db.pool.query(`select reason, http_status from public.quote_failures`);
    expect(rows).toEqual([{ reason: 'return_before_outbound', http_status: 400 }]);
  });

  it('CR-9 Routes API timeout → 503 service_unavailable and a routing_failed row', async () => {
    googleMode = 'timeout';
    const r = await failure(quote(base(), ip));
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('service_unavailable');
    const { rows } = await db.pool.query(`select reason, http_status, request from public.quote_failures`);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('routing_failed');
    expect(rows[0].http_status).toBe(503);
    // coordinates and times only: no address, name, email or phone
    expect(Object.keys(rows[0].request.pickup).sort()).toEqual(['lat', 'lng', 'placeId']);
    expect(JSON.stringify(rows[0].request)).not.toMatch(/Hilton|address|email|phone/i);
  });

  it('CR-10 all class rates 0 → 422 not_priced and a quote_failures row', async () => {
    await db.pool.query(
      `insert into public.class_rates (class_key, base_fare, per_km, per_min, minimum_fare)
       select key, 0, 0, 0, 0 from public.vehicle_classes`,
    );
    const r = await failure(quote(base(), ip));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('not_priced');
    const { rows } = await db.pool.query(`select reason from public.quote_failures`);
    expect(rows).toEqual([{ reason: 'not_priced' }]);
  });

  it('CR-11 quote_only_over_km=50 and a ~60 km trip → 422 quote_only_distance', async () => {
    await db.pool.query(
      `insert into public.pricing_settings (doc)
       select doc || jsonb_build_object('quote_only_over_km', 50) from public.current_pricing_settings`,
    );
    const r = await failure(quote(base(), ip));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('quote_only_distance');
    const { rows } = await db.pool.query(`select reason, distance_km from public.quote_failures`);
    expect(rows[0].reason).toBe('quote_only_distance');
    expect(Number(rows[0].distance_km)).toBeGreaterThan(50);
  });

  it('CR-12 a Corinth address → 422 outside_area, before any Google call', async () => {
    const r = await failure(quote(base({ dropoffPlace: CORINTH }), ip));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('outside_area');
    expect(googleCalls).toBe(0);
  });

  it('CR-12b a pick-up inside the minimum notice → 400 pickup_too_soon', async () => {
    const r = await failure(quote(base({ pickupLocal: athens(0.5) }), ip));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('pickup_too_soon');
    expect(r.body.fields?.pickupLocal).toBeTruthy();
  });
});
