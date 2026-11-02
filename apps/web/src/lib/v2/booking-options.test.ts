import { describe, expect, it } from 'vitest';
import {
  bookingOptionPriceLabels,
  fillBookingOptionNote,
  lowestHourlyCents,
  lowestTransferCents,
} from './booking-options';
import type { Catalog } from '../server/catalog';

const cat = {
  classes: [{ key: 'a', maxPassengers: 1, maxLuggage: 1, sortOrder: 1 }, { key: 'b', maxPassengers: 1, maxLuggage: 1, sortOrder: 2 }],
  zones: [],
  routes: [],
  prices: [
    { fromCode: 'x', toCode: 'y', classKey: 'a', cents: 20000 },
    { fromCode: 'x', toCode: 'y', classKey: 'b', cents: 15000 },
  ],
  hourly: [
    { classKey: 'a', cents: 9000, minHours: 4, maxHours: 12 },
    { classKey: 'b', cents: 6000, minHours: 3, maxHours: 12 },
  ],
} as Catalog;

describe('booking options from prices (V2-5)', () => {
  it('fills {fromTransfer} and {fromHourly} with lowest API prices', () => {
    expect(lowestTransferCents(cat)).toBe(15000);
    expect(lowestHourlyCents(cat)).toBe(6000);
    const labels = bookingOptionPriceLabels(cat, true);
    expect(fillBookingOptionNote('From {fromTransfer}', labels)).toBe('From € 150.00');
    expect(fillBookingOptionNote('From {fromHourly} / hour', labels)).toBe('From € 60.00 / hour');
  });
});
