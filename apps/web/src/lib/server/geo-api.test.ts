import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tem/features', () => ({
  features: vi.fn(() => ({
    distancePricing: false,
    serviceArea: 'attica',
  })),
  notFoundUnless: (flag: boolean) =>
    flag ? null : new Response(null, { status: 404, statusText: 'Not Found' }),
}));

vi.mock('./rate-limit', () => ({
  assertRateLimit: vi.fn(async () => undefined),
}));

vi.mock('../env', () => ({
  getPublicEnv: () => ({ PUBLIC_SITE_URL: 'http://127.0.0.1:4321' }),
}));

vi.mock('./db', () => ({
  bookingDb: () => ({
    query: async () => ({ rows: [] }),
  }),
}));

import { features } from '@tem/features';
import { assertRateLimit } from './rate-limit';
import { handleGeoCheck } from './geo-api';

const ORIGIN = 'http://127.0.0.1:4321';

function req(body: unknown, origin = ORIGIN) {
  return new Request('http://127.0.0.1:4321/api/geo/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

describe('/api/geo/check', () => {
  beforeEach(() => {
    vi.mocked(features).mockReturnValue({
      distancePricing: false,
      serviceArea: 'attica',
    } as ReturnType<typeof features>);
    vi.mocked(assertRateLimit).mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 404 when distancePricing is off', async () => {
    const res = await handleGeoCheck(req({ lat: 37.9755, lng: 23.7348 }), 'vid', '1.1.1.1', ORIGIN);
    expect(res.status).toBe(404);
  });

  it('returns inArea true for Syntagma when on', async () => {
    vi.mocked(features).mockReturnValue({
      distancePricing: true,
      serviceArea: 'attica',
    } as ReturnType<typeof features>);
    const res = await handleGeoCheck(req({ lat: 37.9755, lng: 23.7348 }), 'vid', '1.1.1.1', ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inArea).toBe(true);
    expect(body).toHaveProperty('kind');
  });

  it('returns inArea false for Corinth when on', async () => {
    vi.mocked(features).mockReturnValue({
      distancePricing: true,
      serviceArea: 'attica',
    } as ReturnType<typeof features>);
    const res = await handleGeoCheck(req({ lat: 37.9386, lng: 22.9322 }), 'vid', '1.1.1.1', ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inArea).toBe(false);
    expect(body.kind).toBeNull();
  });
});
