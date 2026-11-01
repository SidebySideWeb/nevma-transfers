import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import type pg from 'pg';
import { hasDatabaseUrl } from '../../test/has-database';
import { priceLabel } from '../content/price-label';
import { getPublishableRoutes, setSanityRoutesForTests } from '../content/routes';
import { t } from '../strings';
import {
  clearCatalogCache,
  fromPriceForClass,
  fromPriceForRoute,
  getCatalog,
  setCatalogLoader,
  type Catalog,
} from './catalog';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

async function catalogFromPool(pool: pg.Pool): Promise<Catalog> {
  const zones = (
    await pool.query<{ code: string; name: string; sort_order: number }>(
      `select code, name, sort_order from public.zones where active order by sort_order, code`,
    )
  ).rows.map((z) => ({ code: z.code, name: z.name, sortOrder: z.sort_order }));

  const classes = (
    await pool.query<{
      key: string;
      max_passengers: number;
      max_luggage: number;
      sort_order: number;
    }>(
      `select key, max_passengers, max_luggage, sort_order
         from public.vehicle_classes where active order by sort_order, key`,
    )
  ).rows.map((c) => ({
    key: c.key,
    maxPassengers: c.max_passengers,
    maxLuggage: c.max_luggage,
    sortOrder: c.sort_order,
  }));

  const routes = (
    await pool.query<{ from_code: string; to_code: string; duration_minutes: number }>(
      `select zf.code as from_code, zt.code as to_code, r.duration_minutes
         from public.zone_routes r
         join public.zones zf on zf.id = r.from_zone_id
         join public.zones zt on zt.id = r.to_zone_id`,
    )
  ).rows.map((r) => ({
    fromCode: r.from_code,
    toCode: r.to_code,
    durationMinutes: r.duration_minutes,
  }));

  const prices = (
    await pool.query<{
      from_code: string;
      to_code: string;
      class_key: string;
      price_cents: number;
    }>(
      `select zf.code as from_code, zt.code as to_code, c.key as class_key, p.price_cents
         from public.zone_prices p
         join public.zones zf on zf.id = p.from_zone_id
         join public.zones zt on zt.id = p.to_zone_id
         join public.vehicle_classes c on c.id = p.class_id`,
    )
  ).rows.map((p) => ({
    fromCode: p.from_code,
    toCode: p.to_code,
    classKey: p.class_key,
    cents: p.price_cents,
  }));

  const hourly = (
    await pool.query<{
      class_key: string;
      price_per_hour_cents: number;
      min_hours: number;
      max_hours: number;
    }>(
      `select c.key as class_key, h.price_per_hour_cents, h.min_hours, h.max_hours
         from public.hourly_rates h
         join public.vehicle_classes c on c.id = h.class_id`,
    )
  ).rows.map((h) => ({
    classKey: h.class_key,
    cents: h.price_per_hour_cents,
    minHours: h.min_hours,
    maxHours: h.max_hours,
  }));

  return { zones, routes, prices, hourly, classes };
}

describe.skipIf(!hasDatabaseUrl)('catalog (prompt 16)', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb({ seed: true });
    clearCatalogCache();
    setCatalogLoader(() => catalogFromPool(db.pool));
    setSanityRoutesForTests(null);
  });

  afterEach(async () => {
    setCatalogLoader(null);
    clearCatalogCache();
    setSanityRoutesForTests(null);
    await db?.drop();
  });

  it('AC-25: fromPriceForRoute airport→centre has five seeded prices; north→port sprinter null; fromPriceForClass matches SQL min; priceLabel fallbacks', async () => {
    const cat = await getCatalog();

    const airportCentre = fromPriceForRoute(cat, 'demo-airport', 'demo-centre');
    expect(airportCentre).toHaveLength(5);
    const seeded = (
      await db.pool.query<{ class_key: string; price_cents: number }>(
        `select c.key as class_key, p.price_cents
           from public.zone_prices p
           join public.zones zf on zf.id = p.from_zone_id
           join public.zones zt on zt.id = p.to_zone_id
           join public.vehicle_classes c on c.id = p.class_id
          where zf.code = 'demo-airport' and zt.code = 'demo-centre'
          order by c.sort_order`,
      )
    ).rows;
    expect(airportCentre.map((r) => ({ classKey: r.classKey, cents: r.cents }))).toEqual(
      seeded.map((r) => ({ classKey: r.class_key, cents: r.price_cents })),
    );

    const northPort = fromPriceForRoute(cat, 'demo-north', 'demo-port');
    // DEMO seed omits demo-sprinter on this pair (prompt text said demo-v-class; seed is sprinter).
    expect(northPort.find((r) => r.classKey === 'demo-sprinter')?.cents).toBeNull();
    expect(northPort.find((r) => r.classKey === 'demo-v-class')?.cents).not.toBeNull();

    const { rows: minRows } = await db.pool.query<{ min: number }>(
      `select min(p.price_cents)::int as min
         from public.zone_prices p
         join public.vehicle_classes c on c.id = p.class_id
        where c.key = 'demo-e-class'`,
    );
    expect(fromPriceForClass(cat, 'demo-e-class')).toBe(minRows[0].min);

    expect(priceLabel(null, { show: true }).text).toBe(t('site.noOnlinePrice'));
    expect(priceLabel(7000, { show: false }).text).toBe(t('site.noOnlinePrice'));
    expect(priceLabel(null, { show: true }).isPrice).toBe(false);
    expect(priceLabel(7000, { show: false }).isPrice).toBe(false);
  });

  it('AC-32: Sanity route with fromZone demo-mars is skipped and logged once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setSanityRoutesForTests([
      {
        title: 'Mars',
        slug: 'to-mars',
        fromZone: 'demo-mars',
        toZone: 'demo-centre',
      },
      {
        title: 'Airport',
        slug: 'athens-airport-to-city-centre',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
      },
    ]);

    const first = await getPublishableRoutes();
    const second = await getPublishableRoutes();
    expect(first.map((r) => r.slug)).toEqual(['athens-airport-to-city-centre']);
    expect(second).toHaveLength(1);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    const hits = messages.filter((m) =>
      m.includes('[routes] skipped to-mars: unknown zone pair demo-mars -> demo-centre'),
    );
    expect(hits).toHaveLength(1);
    warn.mockRestore();
  });

  it('catalog is fetched once per build (loader spy)', async () => {
    const inner = () => catalogFromPool(db.pool);
    const spy = vi.fn(inner);
    setCatalogLoader(spy);
    await getCatalog();
    await getCatalog();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
