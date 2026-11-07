/**
 * B10: each named profile resolves to the expected features() shape, and legacy
 * admin nav matches the pre–booking-v2 contract (no Companies / Drivers / Pricing v2).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_NAV, features, filterAdminNav } from '../packages/features/src/index.mjs';
import {
  FEATURE_PROFILES,
  LEGACY_ADMIN_NAV_ITEM_IDS,
  V2_NAV_WHEN_OFF,
} from './feature-profiles.mjs';

const silent = { warn() {}, error() {} };

describe('B10 feature profiles', () => {
  for (const profile of FEATURE_PROFILES) {
    it(`${profile.id} resolves as documented`, () => {
      const f = features(profile.env, silent);
      for (const [k, v] of Object.entries(profile.expect)) {
        assert.equal(f[k], v, `${profile.id}.${k}`);
      }
    });
  }

  it('legacy admin nav equals pre-B1 operations + setup (no v2 items)', () => {
    const legacy = FEATURE_PROFILES.find((p) => p.id === 'legacy');
    const f = features(legacy.env, silent);
    const ids = filterAdminNav(f, ADMIN_NAV).flatMap((g) => g.items.map((i) => i.id));
    assert.deepEqual(ids, [...LEGACY_ADMIN_NAV_ITEM_IDS]);
    for (const id of V2_NAV_WHEN_OFF) {
      assert.ok(!ids.includes(id), `legacy must not show ${id}`);
    }
  });

  it('full profile shows Companies, Drivers, Flights and Pricing v2', () => {
    const full = FEATURE_PROFILES.find((p) => p.id === 'full');
    const f = features(full.env, silent);
    const ids = filterAdminNav(f, ADMIN_NAV).flatMap((g) => g.items.map((i) => i.id));
    assert.ok(ids.includes('companies'));
    assert.ok(ids.includes('drivers'));
    assert.ok(ids.includes('reports'));
    assert.ok(ids.includes('pricing-rates'));
    assert.ok(ids.includes('pricing-simulator'));
    assert.ok(ids.includes('pricing-flights'));
    assert.ok(ids.includes('pricing-demand'));
    assert.ok(!ids.includes('prices') || ids.filter((i) => i === 'prices').length >= 1);
  });

  it('friend profile has Drivers but not Companies or Flights', () => {
    const friend = FEATURE_PROFILES.find((p) => p.id === 'friend');
    const f = features(friend.env, silent);
    const ids = filterAdminNav(f, ADMIN_NAV).flatMap((g) => g.items.map((i) => i.id));
    assert.ok(ids.includes('drivers'));
    assert.ok(!ids.includes('companies'));
    assert.ok(!ids.includes('pricing-flights'));
  });
});
