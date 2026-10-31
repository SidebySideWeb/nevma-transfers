import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type SanityClass = { key: string };

let sanityCache: { keys: string[]; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function fetchSanityClassKeys(): Promise<string[]> {
  if (sanityCache && Date.now() < sanityCache.expiresAt) return sanityCache.keys;
  const projectId = import.meta.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET || process.env.SANITY_DATASET;
  const token = import.meta.env.SANITY_READ_TOKEN || process.env.SANITY_READ_TOKEN;
  if (!projectId || !dataset) {
    sanityCache = { keys: [], expiresAt: Date.now() + CACHE_MS };
    return [];
  }
  try {
    const { createClient } = await import('@sanity/client');
    const client = createClient({
      projectId,
      dataset,
      apiVersion: '2025-01-01',
      useCdn: false,
      token: token || undefined,
    });
    const rows = await client.fetch<SanityClass[]>('*[_type == "vehicleClass"]{key}');
    const keys = (rows ?? []).map((r) => r.key).filter(Boolean);
    sanityCache = { keys, expiresAt: Date.now() + CACHE_MS };
    return keys;
  } catch {
    sanityCache = { keys: [], expiresAt: Date.now() + CACHE_MS };
    return [];
  }
}

/** Build the cross-check banner text (empty string when nothing to report). */
export async function buildBanner(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const [{ data: classes }, { data: demoSettings }, sanityKeys] = await Promise.all([
    supabase.from('vehicle_classes').select('key').eq('active', true),
    supabase.from('settings').select('key').eq('is_demo', true),
    fetchSanityClassKeys(),
  ]);

  const pgKeys = (classes ?? []).map((c) => c.key);
  const sanitySet = new Set(sanityKeys);
  const pgSet = new Set(pgKeys);

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
  return parts.join(' ');
}

/** Test helper. */
export function clearBannerCache(): void {
  sanityCache = null;
}
