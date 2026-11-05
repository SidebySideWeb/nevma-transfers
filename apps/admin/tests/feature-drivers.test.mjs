import { afterEach, describe, expect, it } from 'vitest';
import { isDriversEnabled } from '../src/lib/features.ts';
import { driversNotFound } from '../src/lib/drivers.ts';
import { buildAdminNav } from '../src/lib/nav.ts';
import { handleMe } from '../src/lib/driver-api/handler.ts';

describe('FEATURE_DRIVERS unset', () => {
  const prev = process.env.FEATURE_DRIVERS;

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_DRIVERS;
    else process.env.FEATURE_DRIVERS = prev;
  });

  it('isDriversEnabled() returns false', () => {
    delete process.env.FEATURE_DRIVERS;
    expect(isDriversEnabled(undefined)).toBe(false);
    expect(isDriversEnabled()).toBe(false);
  });

  it('nav config has no Drivers or Reports', () => {
    delete process.env.FEATURE_DRIVERS;
    const groups = buildAdminNav({ drivers: false, needsVehicle: 0 });
    const labels = groups.flatMap((g) => [g.label, ...g.items.map((i) => i.label)]);
    expect(labels).not.toContain('Drivers');
    expect(labels).not.toContain('Reports');
    expect(groups.some((g) => g.id === 'drivers')).toBe(false);
    expect(groups.some((g) => g.items.some((i) => i.id === 'today'))).toBe(true);
  });

  it('route guards for /drivers, /reports and /api/driver/v1/me return 404', async () => {
    process.env.FEATURE_DRIVERS = 'false';
    const denied = driversNotFound();
    expect(denied).not.toBeNull();
    expect(denied.status).toBe(404);

    const res = await handleMe({
      request: new Request('http://127.0.0.1:4322/api/driver/v1/me'),
      url: new URL('http://127.0.0.1:4322/api/driver/v1/me'),
      params: {},
    });
    expect(res.status).toBe(404);
  });
});

describe('FEATURE_DRIVERS=true', () => {
  const prev = process.env.FEATURE_DRIVERS;

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_DRIVERS;
    else process.env.FEATURE_DRIVERS = prev;
  });

  it('isDriversEnabled() returns true for exact "true"', () => {
    expect(isDriversEnabled('true')).toBe(true);
    expect(isDriversEnabled(true)).toBe(true);
  });

  it('nav config includes Drivers and Reports', () => {
    const groups = buildAdminNav({ drivers: true, needsVehicle: 0 });
    const labels = groups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain('Drivers');
    expect(labels).toContain('Reports');
    expect(groups.some((g) => g.id === 'drivers')).toBe(true);
  });

  it('driversNotFound allows the module through', () => {
    process.env.FEATURE_DRIVERS = 'true';
    expect(driversNotFound()).toBeNull();
  });
});
