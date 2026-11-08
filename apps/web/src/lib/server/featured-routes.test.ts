import { describe, expect, it } from 'vitest';
import { mapFeaturedRow } from './featured-routes';

const base = {
  from_code: 'demo-airport',
  from_name: 'DEMO Athens Airport',
  from_address: 'Athens International Airport (ATH)',
  from_place_id: 'ChIJairport',
  from_lat: 37.9364,
  from_lng: 23.9445,
  from_kind: 'airport',
  to_code: 'demo-centre',
  to_name: 'DEMO Athens',
  to_address: 'Syntagma Square, Athens',
  to_place_id: 'ChIJcentre',
  to_lat: 37.9755,
  to_lng: 23.7348,
  to_kind: 'area',
  duration_minutes: 40,
  from_price_cents: 6500,
};

describe('mapFeaturedRow', () => {
  it('maps a complete row and strips DEMO', () => {
    const r = mapFeaturedRow(base);
    expect(r).toEqual({
      from: {
        code: 'demo-airport',
        name: 'Athens Airport',
        address: 'Athens International Airport (ATH)',
        placeId: 'ChIJairport',
        lat: 37.9364,
        lng: 23.9445,
        kind: 'airport',
      },
      to: {
        code: 'demo-centre',
        name: 'Athens',
        address: 'Syntagma Square, Athens',
        placeId: 'ChIJcentre',
        lat: 37.9755,
        lng: 23.7348,
        kind: 'area',
      },
      durationMin: 40,
      fromPriceCents: 6500,
    });
  });

  it('returns null when a display place is missing', () => {
    expect(mapFeaturedRow({ ...base, from_place_id: '' })).toBeNull();
    expect(mapFeaturedRow({ ...base, to_address: '' })).toBeNull();
  });
});
