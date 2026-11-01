import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readinessBannerLine } from './readiness';

type SanityClass = { key: string; photos?: number };
type SanityRoute = { title?: string; slug?: string; fromZone?: string; toZone?: string };

let sanityClassCache: { rows: SanityClass[]; expiresAt: number } | null = null;
let sanityRouteCache: { routes: SanityRoute[]; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

let routesOverride: SanityRoute[] | null = null;
let classesOverride: SanityClass[] | null = null;

/** Test hook: inject Sanity routes without calling the Content Lake. */
export function setSanityRoutesForBanner(routes: SanityRoute[] | null): void {
  routesOverride = routes;
  sanityRouteCache = null;
}

/** Test hook: inject Sanity class rows (with photo counts) for readiness. */
export function setSanityClassesForBanner(rows: SanityClass[] | null): void {
  classesOverride = rows;
  sanityClassCache = null;
}

async function sanityClient() {
  const projectId = import.meta.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET || process.env.SANITY_DATASET;
  const token = import.meta.env.SANITY_READ_TOKEN || process.env.SANITY_READ_TOKEN;
  if (!projectId || !dataset) return null;
  const { createClient } = await import('@sanity/client');
  return createClient({
    projectId,
    dataset,
    apiVersion: '2025-01-01',
    useCdn: false,
    token: token || undefined,
  });
}

async function fetchSanityClasses(): Promise<SanityClass[]> {
  if (classesOverride) return classesOverride;
  if (sanityClassCache && Date.now() < sanityClassCache.expiresAt) return sanityClassCache.rows;
  try {
    const client = await sanityClient();
    if (!client) {
      sanityClassCache = { rows: [], expiresAt: Date.now() + CACHE_MS };
      return [];
    }
    const rows = await client.fetch<SanityClass[]>(
      '*[_type == "vehicleClass"]{key, "photos": count(photos)}',
    );
    const cleaned = (rows ?? []).filter((r) => r.key);
    sanityClassCache = { rows: cleaned, expiresAt: Date.now() + CACHE_MS };
    return cleaned;
  } catch {
    sanityClassCache = { rows: [], expiresAt: Date.now() + CACHE_MS };
    return [];
  }
}

async function fetchSanityRoutes(): Promise<SanityRoute[]> {
  if (routesOverride) return routesOverride;
  if (sanityRouteCache && Date.now() < sanityRouteCache.expiresAt) return sanityRouteCache.routes;
  try {
    const client = await sanityClient();
    if (!client) {
      sanityRouteCache = { routes: [], expiresAt: Date.now() + CACHE_MS };
      return [];
    }
    const rows = await client.fetch<SanityRoute[]>(
      '*[_type == "route"]{title, "slug": slug.current, fromZone, toZone}',
    );
    const routes = rows ?? [];
    sanityRouteCache = { routes, expiresAt: Date.now() + CACHE_MS };
    return routes;
  } catch {
    sanityRouteCache = { routes: [], expiresAt: Date.now() + CACHE_MS };
    return [];
  }
}

const DEMO_LABEL: Record<string, string> = {
  vehicle_classes: 'classes',
  vehicles: 'vehicles',
  zones: 'zones',
  zone_routes: 'routes',
  zone_prices: 'prices',
  hourly_rates: 'hourly rates',
  extras: 'extras',
  settings: 'settings',
};

const DEMO_HREF: Record<string, string> = {
  vehicle_classes: '/fleet',
  vehicles: '/fleet',
  zones: '/zones',
  zone_routes: '/prices',
  zone_prices: '/prices',
  hourly_rates: '/hourly-rates',
  extras: '/extras',
  settings: '/settings',
};

const DEMO_LINK_ORDER = [
  'vehicle_classes',
  'vehicles',
  'zones',
  'zone_prices',
  'zone_routes',
  'hourly_rates',
  'extras',
  'settings',
] as const;

export type BannerResult = { text: string; href: string };

/** Build the cross-check banner (empty text when nothing to report). */
export async function buildBanner(
  supabase: SupabaseClient<Database>,
): Promise<BannerResult> {
  const [
    { data: classes },
    { data: vehicles },
    { data: zonePrices },
    { data: hourlyRates },
    { data: demoRows },
    { data: zones },
    { data: zoneRoutes },
    sanityClasses,
    sanityRoutes,
  ] = await Promise.all([
    supabase.from('vehicle_classes').select('id, key, active'),
    supabase.from('vehicles').select('class_id, status'),
    supabase.from('zone_prices').select('class_id'),
    supabase.from('hourly_rates').select('class_id'),
    supabase.from('demo_rows').select('table_name, n'),
    supabase.from('zones').select('id, code').eq('active', true),
    supabase.from('zone_routes').select('from_zone_id, to_zone_id'),
    fetchSanityClasses(),
    fetchSanityRoutes(),
  ]);

  const sanityByKey = new Map(sanityClasses.map((r) => [r.key, r]));
  const sanityKeys = sanityClasses.map((r) => r.key);
  const activeClassKeys = (classes ?? []).filter((c) => c.active).map((c) => c.key);
  const pgSet = new Set((classes ?? []).map((c) => c.key));
  const zoneCodes = new Set((zones ?? []).map((z) => z.code));
  const idToCode = new Map((zones ?? []).map((z) => [z.id, z.code]));
  const routePairs = new Set(
    (zoneRoutes ?? [])
      .map((r) => {
        const from = idToCode.get(r.from_zone_id);
        const to = idToCode.get(r.to_zone_id);
        return from && to ? `${from}->${to}` : null;
      })
      .filter((x): x is string => Boolean(x)),
  );

  const activeVehicleClassIds = new Set(
    (vehicles ?? []).filter((v) => v.status === 'active').map((v) => v.class_id),
  );
  const pricedClassIds = new Set([
    ...(zonePrices ?? []).map((p) => p.class_id),
    ...(hourlyRates ?? []).map((r) => r.class_id),
  ]);

  const parts: string[] = [];
  let href = '/settings';

  const demoActive = (demoRows ?? []).filter((r) => (r.n ?? 0) > 0);
  if (demoActive.length > 0) {
    const bits = demoActive.map((r) => {
      const table = r.table_name ?? '';
      const label = DEMO_LABEL[table] ?? table;
      return `${r.n} ${label}`;
    });
    parts.push(`${bits.join(', ')} still DEMO.`);
    for (const key of DEMO_LINK_ORDER) {
      if (demoActive.some((r) => r.table_name === key)) {
        href = DEMO_HREF[key] ?? '/settings';
        break;
      }
    }
  }

  for (const key of activeClassKeys) {
    if (!sanityByKey.has(key)) {
      parts.push(`Vehicle class "${key}" exists in the database but has no Sanity content.`);
    }
  }
  for (const key of sanityKeys) {
    if (!pgSet.has(key)) {
      parts.push(`Sanity vehicle class "${key}" has no matching Postgres row.`);
    }
  }

  for (const cls of classes ?? []) {
    if (!cls.active) continue;
    const sanity = sanityByKey.get(cls.key);
    const line = readinessBannerLine({
      key: cls.key,
      hasActiveVehicle: activeVehicleClassIds.has(cls.id),
      hasPriceOrRate: pricedClassIds.has(cls.id),
      hasSanityPhotos: (sanity?.photos ?? 0) > 0,
      online: true,
    });
    if (line) parts.push(line);
  }

  for (const route of sanityRoutes) {
    const slug = route.slug || 'unknown';
    const from = route.fromZone || '';
    const to = route.toZone || '';
    const label = route.title || slug;
    if (!from || !to || !zoneCodes.has(from) || !zoneCodes.has(to)) {
      parts.push(
        `Sanity route "${label}" (${slug}) uses unknown zones ${from || '?'} → ${to || '?'}.`,
      );
      continue;
    }
    if (!routePairs.has(`${from}->${to}`)) {
      parts.push(
        `Sanity route "${label}" (${slug}) has no zone_routes row for ${from} → ${to}.`,
      );
    }
  }

  return { text: parts.join(' '), href };
}

/** Test helper. */
export function clearBannerCache(): void {
  sanityClassCache = null;
  sanityRouteCache = null;
}
