import { afterEach, describe, expect, it } from 'vitest';
import { buildBanner, clearBannerCache, setSanityRoutesForBanner } from './banner';

function fakeSupabase(opts: {
  classKeys?: string[];
  zoneCodes?: { id: string; code: string }[];
  routes?: { from_zone_id: string; to_zone_id: string }[];
  demoSettings?: string[];
}) {
  const classes = (opts.classKeys ?? []).map((key) => ({ key }));
  const zones = opts.zoneCodes ?? [];
  const zoneRoutes = opts.routes ?? [];
  const demo = (opts.demoSettings ?? []).map((key) => ({ key }));

  return {
    from(table: string) {
      const rows =
        table === 'vehicle_classes'
          ? classes
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

    const text = await buildBanner(
      fakeSupabase({
        classKeys: ['demo-e-class'],
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
});
