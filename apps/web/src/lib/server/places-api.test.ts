import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tem/places', async () => {
  const actual = await vi.importActual<typeof import('@tem/places')>('@tem/places');
  return {
    ...actual,
    autocomplete: vi.fn(async () => [
      { placeId: 'ChIJ8UNwBh-9oRQR3Y1mdkU1Nic', label: 'Hilton Athens', main: 'Hilton Athens', secondary: 'Athens' },
    ]),
    placeDetails: vi.fn(async () => ({
      placeId: 'ChIJ8UNwBh-9oRQR3Y1mdkU1Nic',
      address: 'Hilton Athens, Athens',
      lat: 37.9767,
      lng: 23.7503,
    })),
  };
});

vi.mock('./rate-limit', () => ({
  assertRateLimit: vi.fn(async () => undefined),
}));

vi.mock('./places-config', async () => {
  const actual = await vi.importActual<typeof import('./places-config')>('./places-config');
  return {
    ...actual,
    placesEnabled: vi.fn(() => true),
    placesApiKey: vi.fn(() => 'test-key'),
    placesBias: vi.fn(() => ({ lat: 37.98, lng: 23.73, radiusM: 50000 })),
  };
});

import { PlacesError } from '@tem/places';
import { autocomplete as placesAutocomplete } from '@tem/places';
import { assertRateLimit } from './rate-limit';
import { placesEnabled } from './places-config';
import { handleAutocomplete, handleDetails, placesFail, placesOffResponse } from './places-api';

const ORIGIN = 'http://127.0.0.1:4321';

function req(path: string, body: unknown, origin = ORIGIN) {
  return new Request(`http://127.0.0.1:4321${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

describe('places API routes', () => {
  beforeEach(() => {
    vi.mocked(placesEnabled).mockReturnValue(true);
    vi.mocked(assertRateLimit).mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 404 when the feature is off', async () => {
    vi.mocked(placesEnabled).mockReturnValue(false);
    expect(placesOffResponse().status).toBe(404);
    const res = await handleAutocomplete(req('/api/places/autocomplete', {}), 'vid', '1.1.1.1', ORIGIN);
    expect(res.status).toBe(404);
  });

  it('rejects cross-origin', async () => {
    const res = await handleAutocomplete(
      req('/api/places/autocomplete', { input: 'hil', sessionToken: '00000000-0000-4000-8000-000000000001' }, 'https://evil.example'),
      'vid',
      '1.1.1.1',
      ORIGIN,
    );
    expect(res.status).toBe(400);
  });

  it('maps places_unavailable to 503 and rate_limit to 429', async () => {
    expect(placesFail(new PlacesError('places_unavailable')).status).toBe(503);
    expect(
      placesFail(
        Object.assign(new Error('rate_limit'), { message: 'rate_limit' }),
      ).status,
    ).toBe(429);
  });

  it('returns suggestions for a valid autocomplete body', async () => {
    const token = '00000000-0000-4000-8000-000000000001';
    const res = await handleAutocomplete(
      req('/api/places/autocomplete', { input: 'hilton ath', sessionToken: token }),
      'vid',
      '1.1.1.1',
      ORIGIN,
    );
    expect(res.status).toBe(200);
    expect(placesAutocomplete).toHaveBeenCalled();
    const body = await res.json();
    expect(body.suggestions[0].main).toBe('Hilton Athens');
  });

  it('returns details for a valid place', async () => {
    const token = '00000000-0000-4000-8000-000000000001';
    const res = await handleDetails(
      req('/api/places/details', { placeId: 'ChIJ8UNwBh-9oRQR3Y1mdkU1Nic', sessionToken: token }),
      'vid',
      '1.1.1.1',
      ORIGIN,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lat).toBeCloseTo(37.9767);
  });
});
