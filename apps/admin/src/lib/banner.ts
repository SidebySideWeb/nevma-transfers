import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type SanityClass = { key: string };
type SanityRoute = { title?: string; slug?: string; fromZone?: string; toZone?: string };

let sanityClassCache: { keys: string[]; expiresAt: number } | null = null;
let sanityRouteCache: { routes: SanityRoute[]; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

let routesOverride: SanityRoute[] | null = null;

/** Test hook: inject Sanity routes without calling the Content Lake. */
export function setSanityRoutesForBanner(routes: SanityRoute[] | null): void {
  routesOverride = routes;
  sanityRouteCache = null;
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

async function fetchSanityClassKeys(): Promise<string[]> {
  if (sanityClassCache && Date.now() < sanityClassCache.expiresAt) return sanityClassCache.keys;
  try {
    const client = await sanityClient();
    if (!client) {
      sanityClassCache = { keys: [], expiresAt: Date.now() + CACHE_MS };
      return [];
    }
    const rows = await client.fetch<SanityClass[]>('*[_type == "vehicleClass"]{key}');
    const keys = (rows ?? []).map((r) => r.key).filter(Boolean);
    sanityClassCache = { keys, expiresAt: Date.now() + CACHE_MS };
    return keys;
  } catch {
    sanityClassCache = { keys: [], expiresAt: Date.now() + CACHE_MS };
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

/** Build the cross-check banner text (empty string when nothing to report). */
export async function buildBanner(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const [{ data: classes }, { data: demoSettings }, { data: zones }, { data: zoneRoutes }, sanityKeys, sanityRoutes] =
    await Promise.all([
      supabase.from('vehicle_classes').select('key').eq('active', true),
      supabase.from('settings').select('key').eq('is_demo', true),
      supabase.from('zones').select('id, code').eq('active', true),
      supabase.from('zone_routes').select('from_zone_id, to_zone_id'),
      fetchSanityClassKeys(),
      fetchSanityRoutes(),
    ]);

  const pgKeys = (classes ?? []).map((c) => c.key);
  const sanitySet = new Set(sanityKeys);
  const pgSet = new Set(pgKeys);
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

  const parts: string[] = [];
  for (const key of pgKeys) {
    if (!sanitySet.has(key)) {
      parts.push(`Vehicle class "${key}" exists in the database but has no Sanity content.`);
    }
  }
  for (const key of sanityKeys) {
    if (!pgSet.has(key)) {
      parts.push(`Sanity vehicle class "${key}" has no matching Postgres row.`);
    }
  }
  const demoKeys = (demoSettings ?? []).map((s) => s.key);
  if (demoKeys.length > 0) {
    parts.push(
      `${demoKeys.length} settings ${demoKeys.length === 1 ? 'is' : 'are'} still DEMO (${demoKeys.join(', ')}).`,
    );
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

  return parts.join(' ');
}

/** Test helper. */
export function clearBannerCache(): void {
  sanityClassCache = null;
  sanityRouteCache = null;
}
