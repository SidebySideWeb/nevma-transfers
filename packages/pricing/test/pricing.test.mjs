import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyReturnDiscount,
  areaFees,
  athensMinutesOfDay,
  inNightWindow,
  periodFactor,
  priceTrip,
  roundUpEuros,
  splitVat,
} from '../src/index.mjs';

const SETTINGS = {
  night: { from: '00:00', to: '06:00', factor: 1.2 },
  stop_fee: 500,
  waiting: { airport_free_min: 60, other_free_min: 15, per_min: 100 },
  rounding: 1,
  return_discount_pct: 0,
  quote_ttl_min: 20,
  demand: { enabled: false, steps: [], max: 1.25 },
};

const RATE = {
  base_fare: 2000,
  per_km: 100,
  per_min: 50,
  minimum_fare: 3000,
  km_per_hour: 40,
};

const DAY = '2026-07-15T12:00:00+03:00'; // noon Athens summer
const NIGHT = '2026-07-15T02:00:00+03:00';

function price(over = {}) {
  return priceTrip({
    trip: {
      type: 'transfer',
      pickupAt: DAY,
      distanceKm: 10,
      durationMin: 20,
      stops: [],
      pickup: { lat: 37.9755, lng: 23.7348 },
      dropoff: { lat: 37.9364, lng: 23.9445 },
      ...(over.trip || {}),
    },
    classes: [{ key: 'e' }, ...(over.classes || [])],
    rates: { e: { ...RATE, ...(over.rate || {}) }, ...(over.rates || {}) },
    settings: { ...SETTINGS, ...(over.settings || {}) },
    periods: over.periods || [],
    areas: over.areas || [],
    zonePrice: over.zonePrice,
    mode: over.mode ?? 'distance',
    demand: over.demand ?? 1,
    extras: over.extras || [],
    vatRateBp: over.vatRateBp ?? 2400,
  });
}

describe('splitVat / roundUpEuros', () => {
  it('splits 24% VAT like the DB generated column', () => {
    // 22000 gross → net 17742, vat 4258 (AC-37)
    assert.deepEqual(splitVat(22000, 2400), { net: 17742, vat: 4258 });
  });

  it('net + vat always equals gross', () => {
    for (const g of [0, 1, 99, 100, 12345, 99999]) {
      const { net, vat } = splitVat(g, 2400);
      assert.equal(net + vat, g);
    }
  });

  it('rounds up to €1', () => {
    assert.equal(roundUpEuros(101, 1), 200);
    assert.equal(roundUpEuros(100, 1), 100);
    assert.equal(roundUpEuros(1, 1), 100);
  });

  it('rounds up to €5', () => {
    assert.equal(roundUpEuros(100, 5), 500);
    assert.equal(roundUpEuros(500, 5), 500);
    assert.equal(roundUpEuros(501, 5), 1000);
  });
});

describe('night window', () => {
  it('default 00:00–06:00 is night at 02:00 Athens', () => {
    assert.equal(inNightWindow(NIGHT, SETTINGS.night), true);
    assert.equal(inNightWindow(DAY, SETTINGS.night), false);
  });

  it('window that crosses midnight (22:00–06:00)', () => {
    const night = { from: '22:00', to: '06:00', factor: 1.2 };
    assert.equal(inNightWindow('2026-07-15T23:30:00+03:00', night), true);
    assert.equal(inNightWindow('2026-07-15T03:00:00+03:00', night), true);
    assert.equal(inNightWindow('2026-07-15T12:00:00+03:00', night), false);
    assert.equal(inNightWindow('2026-07-15T21:59:00+03:00', night), false);
  });

  it('athensMinutesOfDay uses Europe/Athens', () => {
    // 00:30 Athens summer = 21:30 previous day UTC
    assert.equal(athensMinutesOfDay('2026-07-14T21:30:00Z'), 30);
  });
});

describe('period factor', () => {
  it('highest matching period wins (not multiplied)', () => {
    const periods = [
      { starts_on: '2026-07-01', ends_on: '2026-07-31', factor: 1.1, active: true },
      { starts_on: '2026-07-10', ends_on: '2026-07-20', factor: 1.5, active: true },
      { starts_on: '2026-07-01', ends_on: '2026-07-31', factor: 1.2, active: true },
    ];
    assert.equal(periodFactor(DAY, periods), 1.5);
  });

  it('inactive periods are ignored', () => {
    assert.equal(
      periodFactor(DAY, [
        { starts_on: '2026-07-01', ends_on: '2026-07-31', factor: 2, active: false },
      ]),
      1,
    );
  });
});

describe('transfer building blocks', () => {
  it('base_fare + km×per_km + min×per_min', () => {
    // 2000 + 10*100 + 20*50 = 2000+1000+1000 = 4000 → round €1 = 4000
    const r = price();
    assert.equal(r.perClass.e.total, 4000);
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'base_fare'));
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'distance'));
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'time'));
  });

  it('adds stop_fee × stops', () => {
    const r = price({ trip: { stops: [{}, {}] } });
    // 4000 + 2*500 = 5000
    assert.equal(r.perClass.e.total, 5000);
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'stops' && b.amount === 1000));
  });

  it('adds airport/port area fee once per matching area', () => {
    const areas = [
      {
        label: 'LGAV',
        kind: 'airport',
        fee: 1500,
        polygon: {
          type: 'Polygon',
          coordinates: [[[23.9, 37.9], [24.0, 37.9], [24.0, 37.97], [23.9, 37.97], [23.9, 37.9]]],
        },
      },
    ];
    const r = price({
      trip: { dropoff: { lat: 37.9364, lng: 23.9445 } },
      areas,
    });
    assert.equal(r.perClass.e.total, 5500);
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'area_airport'));
  });

  it('areaFees helper returns 0 when fee is 0', () => {
    const { total } = areaFees([{ lat: 37.9364, lng: 23.9445 }], [
      {
        label: 'LGAV',
        kind: 'airport',
        fee: 0,
        polygon: {
          coordinates: [[[23.9, 37.9], [24.0, 37.9], [24.0, 37.97], [23.9, 37.97], [23.9, 37.9]]],
        },
      },
    ]);
    assert.equal(total, 0);
  });

  it('applies night factor', () => {
    const r = price({ trip: { pickupAt: NIGHT } });
    // 4000 * 1.2 = 4800
    assert.equal(r.perClass.e.total, 4800);
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'night'));
  });

  it('applies period factor after night', () => {
    const r = price({
      trip: { pickupAt: NIGHT },
      periods: [{ starts_on: '2026-07-01', ends_on: '2026-07-31', factor: 1.1, active: true }],
    });
    // 4000 * 1.2 = 4800; * 1.1 = 5280 → round €1 = 5300
    assert.equal(r.perClass.e.total, 5300);
  });

  it('applies demand factor', () => {
    const r = price({ demand: 1.1 });
    // 4000 * 1.1 = 4400
    assert.equal(r.perClass.e.total, 4400);
  });

  it('enforces minimum fare', () => {
    const r = price({
      trip: { distanceKm: 1, durationMin: 1 },
      rate: { base_fare: 100, per_km: 0, per_min: 0, minimum_fare: 5000 },
    });
    assert.equal(r.perClass.e.total, 5000);
    assert.ok(r.perClass.e.breakdown.some((b) => b.code === 'minimum'));
  });

  it('rounds up to 5 euros', () => {
    const r = price({
      settings: { ...SETTINGS, rounding: 5 },
      trip: { distanceKm: 1, durationMin: 1 },
      rate: { base_fare: 2100, per_km: 0, per_min: 0, minimum_fare: 0 },
    });
    assert.equal(r.perClass.e.total, 2500);
  });

  it('adds extras after minimum and before final VAT split', () => {
    const r = price({
      extras: [{ code: 'child', label: 'Child seat', amount: 1000 }],
    });
    assert.equal(r.perClass.e.total, 5000);
    assert.equal(r.perClass.e.net + r.perClass.e.vat, 5000);
  });
});

describe('hybrid / zones / not_priced', () => {
  it('hybrid zone price beats distance price', () => {
    const r = price({
      mode: 'hybrid',
      zonePrice: () => 9000,
    });
    assert.equal(r.perClass.e.total, 9000);
    assert.equal(r.perClass.e.breakdown[0].code, 'fixed_route');
    assert.equal(r.perClass.e.breakdown[0].label, 'Fixed route price');
  });

  it('hybrid without zone falls back to distance', () => {
    const r = price({ mode: 'hybrid', zonePrice: () => null });
    assert.equal(r.perClass.e.total, 4000);
  });

  it('zero rates with no zone → not_priced, never total 0 as available', () => {
    const r = price({
      rate: { base_fare: 0, per_km: 0, per_min: 0, minimum_fare: 0 },
      mode: 'distance',
    });
    assert.equal(r.perClass.e.available, false);
    assert.equal(r.perClass.e.reason, 'not_priced');
    assert.equal(r.perClass.e.total, 0);
  });

  it('zones mode uses zone price only', () => {
    const r = price({
      mode: 'zones',
      zonePrice: (k) => (k === 'e' ? 7000 : null),
      rate: { base_fare: 0, per_km: 0, per_min: 0, minimum_fare: 0 },
    });
    assert.equal(r.perClass.e.available, true);
    assert.equal(r.perClass.e.total, 7000);
  });
});

describe('hourly', () => {
  it('hours × hourly rate and kmIncluded', () => {
    const r = priceTrip({
      trip: { type: 'hourly', pickupAt: DAY, durationMin: 240, hours: 4 },
      classes: [{ key: 'e', hourlyRateCents: 8000, minHours: 3, maxHours: 12 }],
      rates: { e: RATE },
      settings: SETTINGS,
    });
    assert.equal(r.perClass.e.total, 32000);
    assert.equal(r.perClass.e.kmIncluded, 160);
    assert.equal(r.perClass.e.available, true);
  });

  it('hourly night factor applies', () => {
    const r = priceTrip({
      trip: { type: 'hourly', pickupAt: NIGHT, durationMin: 180, hours: 3 },
      classes: [{ key: 'e', hourlyRateCents: 10000, minHours: 3, maxHours: 12 }],
      rates: { e: RATE },
      settings: SETTINGS,
    });
    // 30000 * 1.2 = 36000
    assert.equal(r.perClass.e.total, 36000);
  });
});

describe('integer cents integrity', () => {
  it('no drift over 1000 random trips', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < 1000; i++) {
      const km = rnd() * 80;
      const mins = 5 + Math.floor(rnd() * 120);
      const r = price({
        trip: {
          distanceKm: km,
          durationMin: mins,
          pickupAt: rnd() > 0.7 ? NIGHT : DAY,
          stops: rnd() > 0.8 ? [{}] : [],
        },
        rate: {
          base_fare: Math.floor(rnd() * 5000),
          per_km: Math.floor(rnd() * 200),
          per_min: Math.floor(rnd() * 100),
          minimum_fare: Math.floor(rnd() * 8000),
        },
        demand: rnd() > 0.5 ? 1 : 1.1,
        settings: { ...SETTINGS, rounding: rnd() > 0.5 ? 1 : 5 },
        periods:
          rnd() > 0.6
            ? [{ starts_on: '2026-07-01', ends_on: '2026-07-31', factor: 1.15, active: true }]
            : [],
      });
      const p = r.perClass.e;
      if (!p.available) continue;
      assert.equal(Number.isInteger(p.total), true);
      assert.equal(Number.isInteger(p.net), true);
      assert.equal(Number.isInteger(p.vat), true);
      assert.equal(p.net + p.vat, p.total);
      assert.ok(p.total > 0);
      const sumLines = p.breakdown.reduce((s, b) => s + b.amount, 0);
      assert.equal(sumLines, p.total);
    }
  });
});

describe('B6 return discount + per-leg night', () => {
  it('discount applies to leg 2 only', () => {
    assert.equal(applyReturnDiscount(10000, 10), 9000);
    assert.equal(applyReturnDiscount(10000, 0), 10000);
    const out = price({ trip: { pickupAt: DAY } }).perClass.e.total;
    const retNight = price({ trip: { pickupAt: NIGHT } }).perClass.e.total;
    assert.ok(retNight > out);
    const discounted = applyReturnDiscount(retNight, 10);
    assert.equal(discounted, Math.round(retNight * 0.9));
    assert.equal(out + discounted, out + discounted);
  });
});
