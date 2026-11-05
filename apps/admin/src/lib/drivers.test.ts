import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driversNotFound } from './drivers';
import { isDriversEnabled } from './features';
import { handleMe } from './driver-api/handler';
import type { APIContext } from 'astro';

describe('isDriversEnabled', () => {
  const prev = process.env.FEATURE_DRIVERS;

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_DRIVERS;
    else process.env.FEATURE_DRIVERS = prev;
  });

  it('defaults to false', () => {
    delete process.env.FEATURE_DRIVERS;
    expect(isDriversEnabled(undefined)).toBe(false);
    expect(isDriversEnabled('')).toBe(false);
    expect(isDriversEnabled('false')).toBe(false);
  });

  it('is true only for true / "true"', () => {
    expect(isDriversEnabled(true)).toBe(true);
    expect(isDriversEnabled('true')).toBe(true);
    expect(isDriversEnabled('TRUE')).toBe(false);
  });
});

describe('DR-01 FEATURE_DRIVERS off', () => {
  const prev = process.env.FEATURE_DRIVERS;

  beforeEach(() => {
    process.env.FEATURE_DRIVERS = 'false';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_DRIVERS;
    else process.env.FEATURE_DRIVERS = prev;
  });

  it('driversNotFound returns 404', () => {
    const r = driversNotFound();
    expect(r).not.toBeNull();
    expect(r!.status).toBe(404);
  });

  it('driver API routes return 404 when the module is off', async () => {
    const res = await handleMe({
      request: new Request('http://127.0.0.1:4322/api/driver/v1/me'),
      url: new globalThis.URL('http://127.0.0.1:4322/api/driver/v1/me'),
      params: {},
    } as unknown as APIContext);
    expect(res.status).toBe(404);
  });
});
