import { priceLabel } from '../content/price-label';
import type { PublishableClass } from '../content/vehicles';
import {
  fromPriceForClass,
  hourlyFromForClass,
  type Catalog,
} from '../server/catalog';

export type FleetShowcaseCard = {
  key: string;
  name: string;
  kind: string;
  blurb: string;
  seats: string;
  luggage: string;
  airportText: string;
  hourlyText: string;
  hourlyMin: number | null;
  photoUrl: string;
  photoAlt: string;
};

function portablePlain(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((b) => {
      if (!b || typeof b !== 'object') return '';
      const children = (b as { children?: { text?: string }[] }).children;
      if (!Array.isArray(children)) return '';
      return children.map((c) => c?.text ?? '').join('');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function specValue(specs: { label: string; value: string }[] | null | undefined, label: string) {
  const row = specs?.find((s) => s.label.toLowerCase() === label.toLowerCase());
  return row?.value ?? null;
}

/** Airport (AIA → Athens) price for a class; falls back to the cheapest transfer. */
export function airportCentsForClass(cat: Catalog, classKey: string): number | null {
  const preferred = [
    ['ath-airport', 'athens-centre'],
    ['demo-airport', 'demo-centre'],
  ] as const;
  for (const [from, to] of preferred) {
    const hit = cat.prices.find(
      (p) => p.classKey === classKey && p.fromCode === from && p.toCode === to,
    );
    if (hit) return hit.cents;
  }
  return fromPriceForClass(cat, classKey);
}

export function buildFleetShowcaseCards(
  classes: PublishableClass[],
  cat: Catalog,
  showPrices: boolean,
): FleetShowcaseCard[] {
  return classes.map((cls) => {
    const airportCents = airportCentsForClass(cat, cls.key);
    const hourlyCents = hourlyFromForClass(cat, cls.key);
    const airport = priceLabel(airportCents, { show: showPrices });
    const hourly = priceLabel(hourlyCents, { show: showPrices, perHour: true });
    const hourlyRow = cat.hourly.find((h) => h.classKey === cls.key);
    const photo = cls.photos?.[0];
    const seats =
      specValue(cls.specs, 'Passengers') ??
      (cls.maxPassengers ? `Up to ${cls.maxPassengers}` : '');
    const luggage =
      specValue(cls.specs, 'Luggage') ?? (cls.maxLuggage ? `Up to ${cls.maxLuggage}` : '');

    return {
      key: cls.key,
      name: cls.name,
      kind: (cls.tagline || '').toUpperCase(),
      blurb: portablePlain(cls.copy),
      seats,
      luggage,
      // Compact €amount (no thin space) so the design's four-up price row doesn't wrap.
      airportText:
        airport.isPrice && airportCents != null
          ? `€${(airportCents / 100).toFixed(2)}`
          : airport.text,
      hourlyText:
        hourly.isPrice && hourlyCents != null ? `€${(hourlyCents / 100).toFixed(2)}` : hourly.text,
      hourlyMin: hourlyRow?.minHours ?? null,
      photoUrl: photo?.url || photo?.asset?.url || `/images/v2/${cls.key}-street.jpg`,
      photoAlt: photo?.alt || cls.name,
    };
  });
}

/** Keys in catalog order that also exist in Sanity (same filter as getPublishableClasses). */
export function publishableKeysInOrder(
  catalogKeys: string[],
  sanityKeys: Iterable<string>,
): string[] {
  const have = new Set(sanityKeys);
  return catalogKeys.filter((k) => have.has(k));
}
