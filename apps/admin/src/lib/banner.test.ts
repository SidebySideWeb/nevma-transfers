import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBanner,
  clearBannerCache,
  setSanityClassesForBanner,
  setSanityRoutesForBanner,
} from './banner';

function fakeSupabase(opts: {
  classes?: { id: string; key: string; active: boolean }[];
  classKeys?: string[];
  vehicles?: { class_id: string; status: string }[];
  zonePrices?: { class_id: string }[];
  hourlyRates?: { class_id: string }[];
  zoneCodes?: { id: string; code: string }[];
  routes?: { from_zone_id: string; to_zone_id: string }[];
  demoSettings?: string[];
}) {
  const classes =
    opts.classes ??
    (opts.classKeys ?? []).map((key, i) => ({ id: `c${i}`, key, active: true }));
  const zones = opts.zoneCodes ?? [];
  const zoneRoutes = opts.routes ?? [];
  const demo = (opts.demoSettings ?? []).map((key) => ({ key }));
  const vehicles = opts.vehicles ?? [];
  const zonePrices = opts.zonePrices ?? [];
  const hourlyRates = opts.hourlyRates ?? [];

  return {
    from(table: string) {
      const rows =
        table === 'vehicle_classes'
          ? classes
          : table === 'vehicles'
            ? vehicles
            : table === 'zone_prices'
              ? zonePrices
              : table === 'hourly_rates'
                ? hourlyRates
                : table === 'zones'
                  ? zones
                  : table === 'zone_routes'
                    ? zoneRoutes
                    : table === 'settings'
                      ? demo
                      : [];
      const result = Promise.resolve({ data: rows, error: null });
      return {
        select() {
          return Object.assign(result, {
            eq() {
              return result;
            },
          });
        },
      };
    },
  };
}

describe('buildBanner AC-32', () => {
  afterEach(() => {
    setSanityRoutesForBanner(null);
    setSanityClassesForBanner(null);
    clearBannerCache();
  });

  it('lists a Sanity route whose zone codes are unknown', async () => {
    setSanityRoutesForBanner([
      {
        title: 'Ghost route',
        slug: 'ghost-to-nowhere',
        fromZone: 'no-such-zone',
        toZone: 'demo-port',
      },
    ]);
    setSanityClassesForBanner([{ key: 'demo-e-class', photos: 1 }]);

    const text = await buildBanner(
      fakeSupabase({
        classKeys: ['demo-e-class'],
        vehicles: [{ class_id: 'c0', status: 'active' }],
        hourlyRates: [{ class_id: 'c0' }],
        zoneCodes: [{ id: 'z1', code: 'demo-port' }],
        routes: [],
      }) as never,
    );
    expect(text).toMatch(/ghost-to-nowhere/i);
    expect(text).toMatch(/unknown zones/i);
  });

  it('lists a Sanity route with zones but no zone_routes row', async () => {
    setSanityRoutesForBanner([
      {
        title: 'Orphan pair',
        slug: 'airport-to-centre',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
      },
    ]);
    setSanityClassesForBanner([]);
    const text = await buildBanner(
      fakeSupabase({
        zoneCodes: [
          { id: 'a', code: 'demo-airport' },
          { id: 'c', code: 'demo-centre' },
        ],
        routes: [],
      }) as never,
    );
    expect(text).toMatch(/no zone_routes row/i);
    expect(text).toMatch(/airport-to-centre/);
  });

  it('flags an online class that is not ready', async () => {
    setSanityClassesForBanner([{ key: 'limo', photos: 0 }]);
    const text = await buildBanner(
      fakeSupabase({
        classes: [{ id: 'c1', key: 'limo', active: true }],
        vehicles: [],
        zonePrices: [],
        hourlyRates: [],
      }) as never,
    );
    expect(text).toMatch(/Class limo is online but not ready/i);
  });
});
