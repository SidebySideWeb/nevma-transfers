import { fleetGroup, type FleetGroup } from '../content/fleet-group';
import { priceLabel } from '../content/price-label';
import type { PublishableClass } from '../content/vehicles';
import { hourlyFromForClass, type Catalog } from '../server/catalog';
import { airportCentsForClass } from './fleet-showcase';
import { portablePlain } from './portable';

export type FleetCard = {
  key: string;
  name: string;
  fullName: string;
  kind: string;
  group: FleetGroup | 'suv' | 'other';
  blurb: string;
  seats: string;
  luggage: string;
  seatsShort: string;
  luggageShort: string;
  airportText: string;
  hourlyText: string;
  hourlyMin: number | null;
  photoUrl: string;
  photoAlt: string;
};

function specValue(specs: { label: string; value: string }[] | null | undefined, label: string) {
  const row = specs?.find((s) => s.label.toLowerCase() === label.toLowerCase());
  return row?.value ?? null;
}

function euro(cents: number | null, show: boolean, perHour = false) {
  const labeled = priceLabel(cents, { show, perHour });
  if (labeled.isPrice && cents != null) return `€${(cents / 100).toFixed(2)}`;
  return labeled.text;
}

export function buildFleetCards(
  classes: PublishableClass[],
  cat: Catalog,
  showPrices: boolean,
): FleetCard[] {
  return classes.map((cls) => {
    const airportCents = airportCentsForClass(cat, cls.key);
    const hourlyCents = hourlyFromForClass(cat, cls.key);
    const hourlyRow = cat.hourly.find((h) => h.classKey === cls.key);
    const photo = cls.photos?.[0];
    const seats =
      specValue(cls.specs, 'Passengers') ??
      (cls.maxPassengers ? `Up to ${cls.maxPassengers}` : '');
    const luggage =
      specValue(cls.specs, 'Luggage') ?? (cls.maxLuggage ? `Up to ${cls.maxLuggage}` : '');
    const group =
      (cls.group as FleetCard['group'] | undefined) ||
      fleetGroup(cls.tagline, cls.name);

    return {
      key: cls.key,
      name: cls.name,
      fullName: cls.fullName || `Mercedes-Benz ${cls.name}`,
      kind: cls.tagline || '',
      group,
      blurb: portablePlain(cls.copy),
      seats,
      luggage,
      seatsShort: seats,
      luggageShort: luggage,
      airportText: euro(airportCents, showPrices),
      hourlyText: euro(hourlyCents, showPrices),
      hourlyMin: hourlyRow?.minHours ?? null,
      photoUrl: photo?.url || photo?.asset?.url || `/images/v2/${cls.key}-street.jpg`,
      photoAlt: photo?.alt || cls.name,
    };
  });
}

export function filterCounts(cards: FleetCard[]) {
  return {
    all: cards.length,
    vans: cards.filter((c) => c.group === 'van' || c.group === 'suv').length,
    saloons: cards.filter((c) => c.group === 'saloon').length,
  };
}

export function cardMatchesFilter(card: FleetCard, filter: 'all' | 'van' | 'saloon') {
  if (filter === 'all') return true;
  if (filter === 'van') return card.group === 'van' || card.group === 'suv';
  return card.group === 'saloon';
}
