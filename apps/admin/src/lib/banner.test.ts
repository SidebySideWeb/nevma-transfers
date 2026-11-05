import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBanner,
  checksSummary,
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
  demoRows?: { table_name: string; n: number }[];
}) {
  const classes =
    opts.classes ??
    (opts.classKeys ?? []).map((key, i) => ({ id: `c${i}`, key, active: true }));
  const zones = opts.zoneCodes ?? [];
  const zoneRoutes = opts.routes ?? [];
  const vehicles = opts.vehicles ?? [];
  const zonePrices = opts.zonePrices ?? [];
  const hourlyRates = opts.hourlyRates ?? [];
  const demoRows = opts.demoRows ?? [];

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
                    : table === 'demo_rows'
                      ? demoRows
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

  it('summarises the count on one line', () => {
    expect(checksSummary(0)).toBe('');
    expect(checksSummary(1)).toBe('⚠ 1 setup check needs attention · Review');
    expect(checksSummary(9)).toBe('⚠ 9 setup checks need attention · Review');
  });

  it('lists a Sanity route whose zone codes are unknown, with a Studio link when id is present', async () => {
    const prevStudio = process.env.PUBLIC_SANITY_STUDIO_URL;
    process.env.PUBLIC_SANITY_STUDIO_URL = 'https://studio.example';
    try {
      setSanityRoutesForBanner([
        {
          _id: 'route-ghost',
          title: 'Ghost route',
          slug: 'ghost-to-nowhere',
          fromZone: 'no-such-zone',
          toZone: 'demo-port',
        },
      ]);
      setSanityClassesForBanner([{ key: 'demo-e-class', photos: 1 }]);

      const banner = await buildBanner(
        fakeSupabase({
          classKeys: ['demo-e-class'],
          vehicles: [{ class_id: 'c0', status: 'active' }],
          hourlyRates: [{ class_id: 'c0' }],
          zoneCodes: [{ id: 'z1', code: 'demo-port' }],
          routes: [],
        }) as never,
      );
      const routeCheck = banner.checks.find((c) => /ghost-to-nowhere/i.test(c.message));
      expect(routeCheck).toBeTruthy();
      expect(routeCheck?.message).toMatch(/unknown zones/i);
      expect(routeCheck?.group).toBe('routes');
      expect(routeCheck?.studioUrl).toBe(
        'https://studio.example/intent/edit/id=route-ghost;type=route',
      );
      expect(banner.summary).toMatch(/setup check/);
      expect(banner.groups.some((g) => g.id === 'routes')).toBe(true);
    } finally {
      if (prevStudio == null) delete process.env.PUBLIC_SANITY_STUDIO_URL;
      else process.env.PUBLIC_SANITY_STUDIO_URL = prevStudio;
    }
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
    const banner = await buildBanner(
      fakeSupabase({
        zoneCodes: [
          { id: 'a', code: 'demo-airport' },
          { id: 'c', code: 'demo-centre' },
        ],
        routes: [],
      }) as never,
    );
    expect(banner.checks.some((c) => /no zone_routes row/i.test(c.message))).toBe(true);
    expect(banner.checks.some((c) => /airport-to-centre/.test(c.message))).toBe(true);
  });

  it('flags an online class that is not ready under Classes', async () => {
    setSanityClassesForBanner([{ key: 'limo', photos: 0 }]);
    const banner = await buildBanner(
      fakeSupabase({
        classes: [{ id: 'c1', key: 'limo', active: true }],
        vehicles: [],
        zonePrices: [],
        hourlyRates: [],
      }) as never,
    );
    const cls = banner.checks.find((c) => /Class limo is online but not ready/i.test(c.message));
    expect(cls?.group).toBe('classes');
    expect(cls?.href).toBe('/fleet/limo');
  });

  it('groups demo_rows into Classes / Routes / Settings', async () => {
    setSanityClassesForBanner([]);
    const banner = await buildBanner(
      fakeSupabase({
        demoRows: [
          { table_name: 'zone_prices', n: 3 },
          { table_name: 'extras', n: 1 },
          { table_name: 'settings', n: 2 },
          { table_name: 'vehicle_classes', n: 4 },
        ],
      }) as never,
    );
    expect(banner.count).toBe(4);
    expect(banner.checks.find((c) => /3 prices/.test(c.message))?.group).toBe('routes');
    expect(banner.checks.find((c) => /1 extras/.test(c.message))?.group).toBe('settings');
    expect(banner.checks.find((c) => /2 settings/.test(c.message))?.group).toBe('settings');
    expect(banner.checks.find((c) => /4 classes/.test(c.message))?.group).toBe('classes');
    expect(banner.checks.find((c) => /3 prices/.test(c.message))?.href).toBe('/prices');
  });
});
