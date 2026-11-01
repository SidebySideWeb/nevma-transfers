import { createSanityClient } from '../sanity/client';
import { ROUTES_QUERY } from '../sanity/queries';
import { getCatalog, routeExists, durationFor } from '../server/catalog';

export type SanityRoute = {
  title: string;
  slug: string;
  fromZone: string;
  toZone: string;
  intro?: string | null;
  body?: unknown;
  photo?: unknown;
  faq?: { question: string; answer: string; _key?: string }[] | null;
  featured?: boolean | null;
  sortOrder?: number | null;
  seo?: unknown;
  internalNote?: string | null;
};

export type PublishableRoute = SanityRoute & { durationMinutes: number };

const skippedLogged = new Set<string>();

let routesOverride: SanityRoute[] | null = null;

/** Test hook: inject Sanity route fixtures without calling the Content Lake. */
export function setSanityRoutesForTests(routes: SanityRoute[] | null): void {
  routesOverride = routes;
  skippedLogged.clear();
}

async function loadSanityRoutes(): Promise<SanityRoute[]> {
  if (routesOverride) return routesOverride;
  const client = createSanityClient();
  const rows = await client.fetch<SanityRoute[]>(ROUTES_QUERY);
  return rows ?? [];
}

function warnSkipped(slug: string, from: string, to: string): void {
  const key = `${slug}:${from}->${to}`;
  if (skippedLogged.has(key)) return;
  skippedLogged.add(key);
  console.warn(`[routes] skipped ${slug}: unknown zone pair ${from} -> ${to}`);
}

/** Sanity routes whose zone pair exists in the Postgres catalog. */
export async function getPublishableRoutes(): Promise<PublishableRoute[]> {
  const cat = await getCatalog();
  const routes = await loadSanityRoutes();
  const out: PublishableRoute[] = [];
  for (const route of routes) {
    const from = route.fromZone;
    const to = route.toZone;
    const slug = route.slug || 'unknown';
    if (!from || !to || !routeExists(cat, from, to)) {
      warnSkipped(slug, from || '?', to || '?');
      continue;
    }
    out.push({
      ...route,
      durationMinutes: durationFor(cat, from, to) ?? 0,
    });
  }
  return out;
}
