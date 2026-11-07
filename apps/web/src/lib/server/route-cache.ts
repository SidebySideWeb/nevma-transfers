import 'server-only';
import type { RouteDbCache, RouteResult } from '@tem/places';
import { getServiceClient } from './supabase';

/** Supabase-backed route cache (migration 0024). Service role only. */
export function createRouteDbCache(): RouteDbCache {
  return {
    async get(key) {
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from('route_cache')
        .select('distance_km, duration_min, source, expires_at')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error || !data) return null;
      return {
        distanceKm: Number(data.distance_km),
        durationMin: data.duration_min,
        source: 'google',
      } satisfies RouteResult;
    },
    async set(key, value, ttlSeconds) {
      const supabase = getServiceClient();
      const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      await supabase.from('route_cache').upsert(
        {
          cache_key: key,
          distance_km: value.distanceKm,
          duration_min: value.durationMin,
          source: value.source,
          expires_at: expires,
        },
        { onConflict: 'cache_key' },
      );
    },
  };
}
