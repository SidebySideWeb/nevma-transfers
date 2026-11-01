import { describe, expect, it } from 'vitest';
import {
  buildFleetCards,
  cardMatchesFilter,
  filterCounts,
  type FleetCard,
} from './fleet-cards';
import type { PublishableClass } from '../content/vehicles';
import type { Catalog } from '../server/catalog';

function card(partial: Partial<FleetCard> & Pick<FleetCard, 'key' | 'group'>): FleetCard {
  return {
    name: partial.key,
    fullName: `Mercedes-Benz ${partial.key}`,
    kind: '',
    blurb: '',
    seats: 'Up to 7',
    luggage: 'Up to 6',
    seatsShort: 'Up to 7',
    luggageShort: 'Up to 6',
    airportText: '€1',
    hourlyText: '€1',
    hourlyMin: 4,
    photoUrl: '/x.jpg',
    photoAlt: partial.key,
    ...partial,
  };
}

describe('fleet filter counts and hidden state (V2-4)', () => {
  it('counts all / vans / saloons from group', () => {
    const cards = [
      card({ key: 'v-class', group: 'van' }),
      card({ key: 'vito', group: 'van' }),
      card({ key: 'sprinter', group: 'van' }),
      card({ key: 'e-class', group: 'saloon' }),
      card({ key: 's-class', group: 'saloon' }),
    ];
    expect(filterCounts(cards)).toEqual({ all: 5, vans: 3, saloons: 2 });
  });

  it('cardMatchesFilter hides non-matching groups', () => {
    const van = card({ key: 'v-class', group: 'van' });
    const saloon = card({ key: 'e-class', group: 'saloon' });
    expect(cardMatchesFilter(van, 'all')).toBe(true);
    expect(cardMatchesFilter(saloon, 'all')).toBe(true);
    expect(cardMatchesFilter(van, 'van')).toBe(true);
    expect(cardMatchesFilter(saloon, 'van')).toBe(false);
    expect(cardMatchesFilter(van, 'saloon')).toBe(false);
    expect(cardMatchesFilter(saloon, 'saloon')).toBe(true);
  });

  it('suv group counts as vans for the filter', () => {
    const cards = [card({ key: 'g-class', group: 'suv' })];
    expect(filterCounts(cards)).toEqual({ all: 1, vans: 1, saloons: 0 });
    expect(cardMatchesFilter(cards[0]!, 'van')).toBe(true);
  });

  it('buildFleetCards keeps group from Sanity', () => {
    const classes = [
      {
        key: 'e-class',
        name: 'E-Class',
        fullName: 'Mercedes-Benz E-Class',
        tagline: 'Saloon',
        group: 'saloon',
        maxPassengers: 3,
        maxLuggage: 2,
        specs: null,
        photos: [],
        copy: null,
      },
    ] as unknown as PublishableClass[];
    const cat = {
      classes: [],
      zones: [],
      prices: [],
      hourly: [{ classKey: 'e-class', minHours: 3, maxHours: 12, cents: 6000 }],
    } as unknown as Catalog;
    const [c] = buildFleetCards(classes, cat, true);
    expect(c?.group).toBe('saloon');
    expect(cardMatchesFilter(c!, 'saloon')).toBe(true);
    expect(cardMatchesFilter(c!, 'van')).toBe(false);
  });
});
