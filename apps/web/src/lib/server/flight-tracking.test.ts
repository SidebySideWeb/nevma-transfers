import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('flight cron route', () => {
  const prevFeature = process.env.FEATURE_FLIGHT_TRACKING;
  const prevProvider = process.env.FLIGHT_PROVIDER;
  const prevCron = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.FEATURE_FLIGHT_TRACKING = 'true';
    process.env.FLIGHT_PROVIDER = 'manual';
    process.env.CRON_SECRET = 'flight-cron-secret';
    vi.resetModules();
  });

  afterEach(() => {
    if (prevFeature == null) delete process.env.FEATURE_FLIGHT_TRACKING;
    else process.env.FEATURE_FLIGHT_TRACKING = prevFeature;
    if (prevProvider == null) delete process.env.FLIGHT_PROVIDER;
    else process.env.FLIGHT_PROVIDER = prevProvider;
    if (prevCron == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  it('without CRON_SECRET returns 401', async () => {
    const { GET } = await import('../../pages/api/cron/flights');
    const res = await GET({
      request: new Request('http://localhost/api/cron/flights'),
    } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('switch off returns 404', async () => {
    process.env.FEATURE_FLIGHT_TRACKING = 'false';
    vi.resetModules();
    const { GET } = await import('../../pages/api/cron/flights');
    const res = await GET({
      request: new Request('http://localhost/api/cron/flights', {
        headers: { authorization: 'Bearer flight-cron-secret' },
      }),
    } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(404);
  });
});

describe('flight lookup route switch-off', () => {
  const prevFeature = process.env.FEATURE_FLIGHT_TRACKING;
  const prevProvider = process.env.FLIGHT_PROVIDER;

  afterEach(() => {
    if (prevFeature == null) delete process.env.FEATURE_FLIGHT_TRACKING;
    else process.env.FEATURE_FLIGHT_TRACKING = prevFeature;
    if (prevProvider == null) delete process.env.FLIGHT_PROVIDER;
    else process.env.FLIGHT_PROVIDER = prevProvider;
  });

  it('returns 404 when flight tracking off', async () => {
    process.env.FEATURE_FLIGHT_TRACKING = 'false';
    delete process.env.FLIGHT_PROVIDER;
    vi.resetModules();
    const { POST } = await import('../../pages/api/flights/lookup');
    const res = await POST({
      request: new Request('http://localhost/api/flights/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: 'A3603', date: '2026-11-08' }),
      }),
      cookies: { get: () => undefined, set: () => undefined },
      clientAddress: '127.0.0.1',
    } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(404);
  });
});
