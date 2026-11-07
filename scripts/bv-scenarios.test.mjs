/**
 * B10 booking scenarios that can be proven without Viva / a live browser.
 * Heavier BV rows (Viva, dual-browser race, Manage links) stay in docs/QA-BOOKING-V2.md.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inServiceArea } from '../packages/geo/src/index.mjs';
import {
  applyReturnDiscount,
  demandFactor,
  inNightWindow,
  priceTrip,
  roundUpEuros,
} from '../packages/pricing/src/index.mjs';
import { ADMIN_NAV, features, filterAdminNav } from '../packages/features/src/index.mjs';
import { FEATURE_PROFILES } from './feature-profiles.mjs';

const silent = { warn() {}, error() {} };

const SETTINGS = {
  night: { from: '00:00', to: '06:00', factor: 1.2 },
  stop_fee: 500,
  waiting: { airport_free_min: 60, other_free_min: 15, per_min: 100 },
  rounding: 1,
  return_discount_pct: 10,
  quote_ttl_min: 20,
  demand: {
    enabled: true,
    steps: [
      { over: 0.7, factor: 1.1 },
      { over: 0.9, factor: 1.2 },
    ],
    max: 1.25,
  },
};

const RATE = {
  base_fare: 2000,
  per_km: 100,
  per_min: 50,
  minimum_fare: 3000,
  km_per_hour: 40,
};

describe('B10 BV unit coverage (full pricing rules)', () => {
  it('BV-01 hybrid: fixed zone price beats distance base', () => {
    const r = priceTrip({
      trip: {
        type: 'transfer',
        pickupAt: '2026-07-15T12:00:00+03:00',
        distanceKm: 35,
        durationMin: 40,
        stops: [],
        pickup: { lat: 37.9364, lng: 23.9445 },
        dropoff: { lat: 37.9755, lng: 23.7348 },
      },
      classes: [{ key: 'e' }],
      rates: { e: RATE },
      settings: SETTINGS,
      mode: 'hybrid',
      zonePrice: () => 7000,
      demand: 1,
    });
    assert.equal(r.perClass.e.total, 7000);
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'fixed_route'));
  });

  it('BV-02 night distance × 1.2 then round up to €1', () => {
    const r = priceTrip({
      trip: {
        type: 'transfer',
        pickupAt: '2026-07-15T02:00:00+03:00',
        distanceKm: 20,
        durationMin: 30,
        stops: [],
        pickup: { lat: 38.073, lng: 23.81 },
        dropoff: { lat: 37.86, lng: 23.75 },
      },
      classes: [{ key: 'e' }],
      rates: { e: RATE },
      settings: SETTINGS,
      mode: 'distance',
      demand: 1,
    });
    assert.ok(inNightWindow('2026-07-15T02:00:00+03:00', SETTINGS.night));
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'night'));
    // 2000 + 20*100 + 30*50 = 5500 → ×1.2 = 6600 (already on €1)
    assert.equal(r.perClass.e.total, roundUpEuros(6600, 1));
  });

  it('BV-03 Corinth is outside Attica', () => {
    // Corinth centre ≈ 37.938, 22.932
    assert.equal(inServiceArea({ lat: 37.938, lng: 22.932 }, 'attica'), false);
    assert.equal(inServiceArea({ lat: 37.9755, lng: 23.7348 }, 'attica'), true);
  });

  it('BV-04 hourly 4 h → 160 km included at 40 km/h', () => {
    const r = priceTrip({
      trip: {
        type: 'hourly',
        pickupAt: '2026-07-15T12:00:00+03:00',
        hours: 4,
        pickup: { lat: 37.9755, lng: 23.7348 },
      },
      classes: [{ key: 'e', hourlyRateCents: 8000, minHours: 2, maxHours: 12 }],
      rates: { e: { ...RATE, km_per_hour: 40 } },
      settings: SETTINGS,
      mode: 'distance',
    });
    assert.equal(r.perClass.e.kmIncluded, 160);
    assert.equal(r.perClass.e.total, 32000);
  });

  it('BV-08 return discount applies to leg 2 only', () => {
    const leg = 10000;
    assert.equal(applyReturnDiscount(leg, 10), 9000);
    assert.equal(leg + applyReturnDiscount(leg, 10), 19000);
  });

  it('BV-13 zero rates → not_priced / unavailable', () => {
    const r = priceTrip({
      trip: {
        type: 'transfer',
        pickupAt: '2026-07-15T12:00:00+03:00',
        distanceKm: 10,
        durationMin: 20,
        stops: [],
        pickup: { lat: 37.97, lng: 23.73 },
        dropoff: { lat: 37.94, lng: 23.94 },
      },
      classes: [{ key: 'z' }],
      rates: {
        z: { base_fare: 0, per_km: 0, per_min: 0, minimum_fare: 0, km_per_hour: 40 },
      },
      settings: SETTINGS,
      mode: 'distance',
    });
    assert.equal(r.perClass.z.available, false);
    assert.equal(r.perClass.z.reason, 'not_priced');
  });

  it('BV-14 demand at 90 % → factor 1.2 (customer sees only final total)', () => {
    // steps use occupancy > over, so 0.901 clears the 0.9 step.
    const { factor } = demandFactor({
      occupancy: 0.901,
      demand: SETTINGS.demand,
    });
    assert.equal(factor, 1.2);
    const r = priceTrip({
      trip: {
        type: 'transfer',
        pickupAt: '2026-07-15T12:00:00+03:00',
        distanceKm: 10,
        durationMin: 20,
        stops: [],
        pickup: { lat: 37.97, lng: 23.73 },
        dropoff: { lat: 37.94, lng: 23.94 },
      },
      classes: [{ key: 'e' }],
      rates: { e: RATE },
      settings: SETTINGS,
      mode: 'distance',
      demand: 1.2,
    });
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'demand'));
    // Public UI never shows "surge" — only total; unit proves demand is in the math.
    assert.ok(r.perClass.e.total > 4000);
  });

  it('BV-11 corporate: demand ignored; company price wins', () => {
    const r = priceTrip({
      trip: {
        type: 'transfer',
        pickupAt: '2026-07-15T12:00:00+03:00',
        distanceKm: 10,
        durationMin: 20,
        stops: [],
        pickup: { lat: 37.97, lng: 23.73 },
        dropoff: { lat: 37.94, lng: 23.94 },
      },
      classes: [{ key: 'e' }],
      rates: { e: RATE },
      settings: SETTINGS,
      mode: 'distance',
      demand: 1.25,
      company: { prices: { e: 5500 }, discountPct: 50 },
    });
    assert.equal(r.perClass.e.total, 5500);
    assert.ok(!r.perClass.e.breakdown.some((b) => b.code === 'demand'));
  });

  it('legacy profile hides corporate / drivers / pricing-v2 routes from admin nav', () => {
    const legacy = FEATURE_PROFILES.find((p) => p.id === 'legacy');
    const ids = filterAdminNav(features(legacy.env, silent), ADMIN_NAV).flatMap((g) =>
      g.items.map((i) => i.id),
    );
    assert.ok(!ids.includes('companies'));
    assert.ok(!ids.includes('pricing-simulator'));
  });
});
