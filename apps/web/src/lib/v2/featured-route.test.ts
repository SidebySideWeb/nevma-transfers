import { describe, expect, it } from 'vitest';
import { bookRouteHref, featuredRouteRates } from './featured-route';
import type { Catalog } from '../server/catalog';

const cat = {
  classes: [
    { key: 'v-class', maxPassengers: 7, maxLuggage: 6, sortOrder: 1 },
    { key: 'ghost', maxPassengers: 1, maxLuggage: 1, sortOrder: 2 },
  ],
  zones: [],
  routes: [],
  prices: [{ fromCode: 'a', toCode: 'b', classKey: 'v-class', cents: 18000 }],
  hourly: [],
} as Catalog;

describe('featured route rates (V2-5)', () => {
  it('hides classes without a price', () => {
    const names = new Map([
      ['v-class', 'V-Class'],
      ['ghost', 'Ghost'],
    ]);
    const rates = featuredRouteRates(cat, 'a', 'b', names, true);
    expect(rates.map((r) => r.classKey)).toEqual(['v-class']);
    expect(rates[0]?.priceText).toBe('€ 180.00');
  });

  it('builds book href with from/to', () => {
    expect(bookRouteHref('ath-airport', 'athens-centre')).toBe(
      '/book?from=ath-airport&to=athens-centre',
    );
  });
});
