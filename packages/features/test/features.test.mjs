import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADMIN_NAV,
  features,
  filterAdminNav,
  isOn,
  notFoundUnless,
  publicFeatures,
} from '../src/index.mjs';

function silentLog() {
  const errors = [];
  const warns = [];
  return {
    errors,
    warns,
    log: {
      error: (m) => errors.push(String(m)),
      warn: (m) => warns.push(String(m)),
    },
  };
}

describe('features()', () => {
  it('empty env: everything off, pricingMode zones', () => {
    const f = features({}, silentLog().log);
    assert.equal(f.pricingMode, 'zones');
    assert.equal(f.distancePricing, false);
    assert.equal(f.demandPricing, false);
    assert.equal(f.places, false);
    assert.equal(f.returnTrip, false);
    assert.equal(f.flightTracking, false);
    assert.equal(f.corporate, false);
    assert.equal(f.drivers, false);
    assert.equal(f.whatsapp, false);
    assert.equal(f.whatsappNumber, null);
    assert.equal(f.flightProvider, null);
    assert.equal(f.serviceArea, 'attica');
  });

  it('"TRUE", "1" and "yes" are all off', () => {
    assert.equal(isOn('TRUE'), false);
    assert.equal(isOn('1'), false);
    assert.equal(isOn('yes'), false);
    const f = features(
      {
        FEATURE_DRIVERS: 'TRUE',
        FEATURE_WHATSAPP: '1',
        FEATURE_PLACES: 'yes',
        FEATURE_DISTANCE_PRICING: 'True',
      },
      silentLog().log,
    );
    assert.equal(f.drivers, false);
    assert.equal(f.whatsapp, false);
    assert.equal(f.places, false);
    assert.equal(f.distancePricing, false);
  });

  it('exact "true" turns switches on when deps are met', () => {
    const f = features(
      {
        FEATURE_DRIVERS: 'true',
        FEATURE_PLACES: 'true',
        FEATURE_DISTANCE_PRICING: 'true',
        GOOGLE_MAPS_SERVER_KEY: 'k',
        QUOTE_SIGNING_SECRET: 's',
        PRICING_MODE: 'hybrid',
      },
      silentLog().log,
    );
    assert.equal(f.drivers, true);
    assert.equal(f.places, true);
    assert.equal(f.distancePricing, true);
    assert.equal(f.pricingMode, 'hybrid');
  });

  it('distancePricing without keys is forced off and logs', () => {
    const { errors, log } = silentLog();
    const f = features({ FEATURE_DISTANCE_PRICING: 'true' }, log);
    assert.equal(f.distancePricing, false);
    assert.ok(errors.some((e) => e.includes('GOOGLE_MAPS_SERVER_KEY')));
  });

  it('pricingMode distance/hybrid without distancePricing falls back to zones', () => {
    const { errors, log } = silentLog();
    const f = features({ PRICING_MODE: 'hybrid', FEATURE_DISTANCE_PRICING: 'true' }, log);
    assert.equal(f.pricingMode, 'zones');
    assert.equal(f.distancePricing, false);
    assert.ok(errors.some((e) => e.includes('falling back to "zones"')));
  });

  it('demandPricing needs distancePricing', () => {
    const { errors, log } = silentLog();
    const f = features({ FEATURE_DEMAND_PRICING: 'true' }, log);
    assert.equal(f.demandPricing, false);
    assert.ok(errors.some((e) => e.includes('demand pricing stays off')));
  });

  it('flightTracking needs provider; aerodatabox needs key; manual needs none', () => {
    const a = silentLog();
    assert.equal(features({ FEATURE_FLIGHT_TRACKING: 'true' }, a.log).flightTracking, false);
    assert.ok(a.errors.some((e) => e.includes('FLIGHT_PROVIDER')));

    const b = silentLog();
    assert.equal(
      features(
        { FEATURE_FLIGHT_TRACKING: 'true', FLIGHT_PROVIDER: 'aerodatabox' },
        b.log,
      ).flightTracking,
      false,
    );
    assert.ok(b.errors.some((e) => e.includes('FLIGHT_PROVIDER_KEY')));

    const c = silentLog();
    const f = features(
      { FEATURE_FLIGHT_TRACKING: 'true', FLIGHT_PROVIDER: 'manual' },
      c.log,
    );
    assert.equal(f.flightTracking, true);
    assert.equal(f.flightProvider, 'manual');
    assert.equal(c.errors.length, 0);
  });

  it('whatsapp needs a valid WHATSAPP_NUMBER', () => {
    const a = silentLog();
    assert.equal(features({ FEATURE_WHATSAPP: 'true', WHATSAPP_NUMBER: '+30 694' }, a.log).whatsapp, false);
    assert.ok(a.errors.some((e) => e.includes('WHATSAPP_NUMBER')));

    const f = features(
      { FEATURE_WHATSAPP: 'true', WHATSAPP_NUMBER: '306900000000' },
      silentLog().log,
    );
    assert.equal(f.whatsapp, true);
    assert.equal(f.whatsappNumber, '306900000000');
  });

  it('unknown PRICING_MODE warns and becomes zones', () => {
    const { warns, log } = silentLog();
    const f = features({ PRICING_MODE: 'surge' }, log);
    assert.equal(f.pricingMode, 'zones');
    assert.ok(warns.some((w) => w.includes('unknown')));
  });
});

describe('publicFeatures()', () => {
  it('contains no key whose name ends in KEY or SECRET', () => {
    const f = features(
      {
        FEATURE_DISTANCE_PRICING: 'true',
        GOOGLE_MAPS_SERVER_KEY: 'maps-key',
        QUOTE_SIGNING_SECRET: 'quote-secret',
        FEATURE_WHATSAPP: 'true',
        WHATSAPP_NUMBER: '306900000000',
        PRICING_MODE: 'distance',
      },
      silentLog().log,
    );
    const pub = publicFeatures(f);
    for (const key of Object.keys(pub)) {
      assert.ok(!/KEY$/i.test(key), key);
      assert.ok(!/SECRET$/i.test(key), key);
    }
    assert.equal(pub.whatsappNumber, '306900000000');
    assert.equal(pub.pricingMode, 'distance');
  });
});

describe('notFoundUnless()', () => {
  it('returns 404 when off, null when on', () => {
    assert.equal(notFoundUnless(true), null);
    const r = notFoundUnless(false);
    assert.ok(r instanceof Response);
    assert.equal(r.status, 404);
  });
});

describe('filterAdminNav()', () => {
  it('with everything off has no Drivers and no Pricing v2 items', () => {
    const f = features({}, silentLog().log);
    const groups = filterAdminNav(f, ADMIN_NAV);
    const labels = groups.flatMap((g) => [g.label, ...g.items.map((i) => i.label)]);
    assert.ok(!labels.includes('Drivers'));
    assert.ok(!labels.includes('Reports'));
    assert.ok(!labels.includes('Rates'));
    assert.ok(!labels.includes('Simulator'));
    assert.ok(!groups.some((g) => g.id === 'drivers'));
    assert.ok(groups.some((g) => g.items.some((i) => i.id === 'today')));
    assert.ok(labels.includes('Zone prices'));
    assert.ok(labels.includes('Hourly rates'));
    assert.ok(labels.includes('Extras'));
    assert.ok(!labels.includes('Fixed routes'));
    assert.ok(!labels.includes('Rates'));
  });

  it('with distancePricing off, Pricing menu matches the legacy items', () => {
    const f = features({}, silentLog().log);
    const pricing = filterAdminNav(f).find((g) => g.id === 'pricing');
    assert.deepEqual(
      pricing.items.map((i) => i.label),
      ['Zone prices', 'Hourly rates', 'Extras'],
    );
  });

  it('with drivers and distancePricing shows those items', () => {
    const f = features(
      {
        FEATURE_DRIVERS: 'true',
        FEATURE_DISTANCE_PRICING: 'true',
        GOOGLE_MAPS_SERVER_KEY: 'k',
        QUOTE_SIGNING_SECRET: 's',
      },
      silentLog().log,
    );
    const groups = filterAdminNav(f);
    const labels = groups.flatMap((g) => g.items.map((i) => i.label));
    assert.ok(labels.includes('Drivers'));
    assert.ok(labels.includes('Rates'));
    assert.ok(labels.includes('Fixed routes'));
    assert.ok(labels.includes('Hourly'));
    assert.ok(labels.includes('Simulator'));
    assert.ok(!labels.includes('Zone prices'));
    assert.ok(!labels.includes('Flights'));
  });

  it('flightTracking shows Flights nav item', () => {
    const f = features(
      { FEATURE_FLIGHT_TRACKING: 'true', FLIGHT_PROVIDER: 'manual' },
      silentLog().log,
    );
    const labels = filterAdminNav(f).flatMap((g) => g.items.map((i) => i.label));
    assert.ok(labels.includes('Flights'));
  });
});
