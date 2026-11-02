import { formatEuro } from '../booking/pricing';
import type { Catalog } from '../server/catalog';
import { fromPriceForRoute } from '../server/catalog';

export type FeaturedRate = { classKey: string; name: string; priceText: string; cents: number };

/** One priced row per class for a zone pair; classes without a price are omitted. */
export function featuredRouteRates(
  cat: Catalog,
  fromCode: string,
  toCode: string,
  classNames: Map<string, string>,
  show: boolean,
): FeaturedRate[] {
  if (!show) return [];
  const out: FeaturedRate[] = [];
  for (const row of fromPriceForRoute(cat, fromCode, toCode)) {
    if (row.cents == null) continue;
    out.push({
      classKey: row.classKey,
      name: classNames.get(row.classKey) || row.classKey,
      priceText: formatEuro(row.cents),
      cents: row.cents,
    });
  }
  return out;
}

export function bookRouteHref(fromCode: string, toCode: string): string {
  const q = new URLSearchParams({ from: fromCode, to: toCode });
  return `/book?${q.toString()}`;
}

/** Map DEMO seed zone codes onto the live fleet-feed codes used for prices. */
export function liveZoneCode(code: string): string {
  const map: Record<string, string> = {
    'demo-airport': 'ath-airport',
    'demo-centre': 'athens-centre',
    'demo-port': 'piraeus-port',
    'demo-north': 'athens-north',
  };
  return map[code] || code;
}
