import 'server-only';
import { getServiceClient } from './supabase';

export type CatalogZone = { code: string; name: string; sortOrder: number };
export type CatalogRoute = { fromCode: string; toCode: string; durationMinutes: number };
export type CatalogPrice = { fromCode: string; toCode: string; classKey: string; cents: number };
export type CatalogHourly = { classKey: string; cents: number; minHours: number; maxHours: number };
export type CatalogClass = {
  key: string;
  maxPassengers: number;
  maxLuggage: number;
  sortOrder: number;
};

export type Catalog = {
  zones: CatalogZone[];
  routes: CatalogRoute[];
  prices: CatalogPrice[];
  hourly: CatalogHourly[];
  classes: CatalogClass[];
};

type CatalogLoader = () => Promise<Catalog>;

let cache: Catalog | null = null;
let loader: CatalogLoader | null = null;

export function clearCatalogCache(): void {
  cache = null;
}

/** Test hook: replace the Postgres fetch (still memoised by getCatalog). */
export function setCatalogLoader(fn: CatalogLoader | null): void {
  loader = fn;
  cache = null;
}

async function fetchViaServiceClient(): Promise<Catalog> {
  const client = getServiceClient();
  const [zonesRes, classesRes, routesRes, pricesRes, hourlyRes] = await Promise.all([
    client
      .from('zones')
      .select('id, code, name, sort_order')
      .eq('active', true)
      .order('sort_order'),
    client
      .from('vehicle_classes')
      .select('id, key, max_passengers, max_luggage, sort_order')
      .eq('active', true)
      .order('sort_order'),
    client.from('zone_routes').select('from_zone_id, to_zone_id, duration_minutes'),
    client.from('zone_prices').select('from_zone_id, to_zone_id, class_id, price_cents'),
    client.from('hourly_rates').select('class_id, price_per_hour_cents, min_hours, max_hours'),
  ]);

  for (const res of [zonesRes, classesRes, routesRes, pricesRes, hourlyRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const zones = (zonesRes.data ?? []).map((z) => ({
    code: z.code,
    name: z.name,
    sortOrder: z.sort_order,
  }));
  const zoneCode = new Map((zonesRes.data ?? []).map((z) => [z.id, z.code]));

  const classes = (classesRes.data ?? []).map((c) => ({
    key: c.key,
    maxPassengers: c.max_passengers,
    maxLuggage: c.max_luggage,
    sortOrder: c.sort_order,
  }));
  const classKey = new Map((classesRes.data ?? []).map((c) => [c.id, c.key]));

  const routes: CatalogRoute[] = [];
  for (const r of routesRes.data ?? []) {
    const fromCode = zoneCode.get(r.from_zone_id);
    const toCode = zoneCode.get(r.to_zone_id);
    if (!fromCode || !toCode) continue;
    routes.push({ fromCode, toCode, durationMinutes: r.duration_minutes });
  }

  const prices: CatalogPrice[] = [];
  for (const p of pricesRes.data ?? []) {
    const fromCode = zoneCode.get(p.from_zone_id);
    const toCode = zoneCode.get(p.to_zone_id);
    const key = classKey.get(p.class_id);
    if (!fromCode || !toCode || !key) continue;
    prices.push({ fromCode, toCode, classKey: key, cents: p.price_cents });
  }

  const hourly: CatalogHourly[] = [];
  for (const h of hourlyRes.data ?? []) {
    const key = classKey.get(h.class_id);
    if (!key) continue;
    hourly.push({
      classKey: key,
      cents: h.price_per_hour_cents,
      minHours: h.min_hours,
      maxHours: h.max_hours,
    });
  }

  return { zones, routes, prices, hourly, classes };
}

/** Build-time booking catalog (memoised once per process / build). */
export async function getCatalog(): Promise<Catalog> {
  if (cache) return cache;
  const load = loader ?? fetchViaServiceClient;
  cache = await load();
  return cache;
}

export function fromPriceForRoute(
  cat: Catalog,
  from: string,
  to: string,
): { classKey: string; cents: number | null }[] {
  const byClass = new Map<string, number>();
  for (const p of cat.prices) {
    if (p.fromCode === from && p.toCode === to) byClass.set(p.classKey, p.cents);
  }
  return cat.classes.map((c) => ({
    classKey: c.key,
    cents: byClass.has(c.key) ? (byClass.get(c.key) as number) : null,
  }));
}

export function lowestRoutePrice(cat: Catalog, from: string, to: string): number | null {
  let min: number | null = null;
  for (const row of fromPriceForRoute(cat, from, to)) {
    if (row.cents == null) continue;
    if (min == null || row.cents < min) min = row.cents;
  }
  return min;
}

export function fromPriceForClass(cat: Catalog, classKey: string): number | null {
  let min: number | null = null;
  for (const p of cat.prices) {
    if (p.classKey !== classKey) continue;
    if (min == null || p.cents < min) min = p.cents;
  }
  return min;
}

export function hourlyFromForClass(cat: Catalog, classKey: string): number | null {
  const row = cat.hourly.find((h) => h.classKey === classKey);
  return row ? row.cents : null;
}

export function routeExists(cat: Catalog, from: string, to: string): boolean {
  return cat.routes.some((r) => r.fromCode === from && r.toCode === to);
}

export function durationFor(cat: Catalog, from: string, to: string): number | null {
  const row = cat.routes.find((r) => r.fromCode === from && r.toCode === to);
  return row ? row.durationMinutes : null;
}
