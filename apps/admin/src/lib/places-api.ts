import {
  PlacesError,
  autocomplete as placesAutocomplete,
  placeDetails as placesDetails,
} from '@tem/places';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from './env';

const NO_STORE = { 'cache-control': 'no-store' };

export function placesEnabled(): boolean {
  const flag = import.meta.env.PUBLIC_ADDRESS_AUTOCOMPLETE ?? process.env.PUBLIC_ADDRESS_AUTOCOMPLETE;
  const key = import.meta.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;
  return flag === 'true' && typeof key === 'string' && key.length > 0;
}

function apiKey(): string {
  return (import.meta.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY ?? '') as string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE, 'content-type': 'application/json' },
  });
}

async function rateLimit(
  client: SupabaseClient,
  key: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  const { data, error } = await client.rpc('hit_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) return false;
  return Boolean(data);
}

function fail(e: unknown): Response {
  if (e instanceof PlacesError) {
    const status = e.code === 'places_unavailable' ? 503 : 400;
    return json(
      {
        error: e.code === 'places_unavailable' ? 'places_unavailable' : 'invalid_request',
        message: e.message,
      },
      status,
    );
  }
  return json({ error: 'places_unavailable', message: 'places_unavailable' }, 503);
}

export async function handleAdminAutocomplete(
  request: Request,
  client: SupabaseClient,
  userId: string,
  ip?: string,
): Promise<Response> {
  if (!placesEnabled()) return new Response(null, { status: 404, headers: NO_STORE });
  try {
    const origin = request.headers.get('origin');
    const allowed = getPublicEnv().PUBLIC_ADMIN_URL.replace(/\/$/, '');
    if (origin && origin.replace(/\/$/, '') !== allowed) {
      return json({ error: 'invalid_request', message: 'invalid_request' }, 400);
    }
    if (ip && !(await rateLimit(client, `places-ac:ip:${ip}`, 60, 30))) {
      return json({ error: 'rate_limited', message: 'rate_limited' }, 429);
    }
    if (!(await rateLimit(client, `places-ac:uid:${userId}`, 60, 30))) {
      return json({ error: 'rate_limited', message: 'rate_limited' }, 429);
    }
    if (!(await rateLimit(client, `places-ac-day:uid:${userId}`, 86400, 300))) {
      return json({ error: 'rate_limited', message: 'rate_limited' }, 429);
    }
    const body = (await request.json()) as { input?: string; sessionToken?: string };
    const suggestions = await placesAutocomplete({
      input: String(body.input ?? ''),
      sessionToken: String(body.sessionToken ?? ''),
      apiKey: apiKey(),
    });
    return json({ suggestions }, 200);
  } catch (e) {
    return fail(e);
  }
}

export async function handleAdminDetails(
  request: Request,
  client: SupabaseClient,
  userId: string,
  ip?: string,
): Promise<Response> {
  if (!placesEnabled()) return new Response(null, { status: 404, headers: NO_STORE });
  try {
    const origin = request.headers.get('origin');
    const allowed = getPublicEnv().PUBLIC_ADMIN_URL.replace(/\/$/, '');
    if (origin && origin.replace(/\/$/, '') !== allowed) {
      return json({ error: 'invalid_request', message: 'invalid_request' }, 400);
    }
    if (ip && !(await rateLimit(client, `places-dt:ip:${ip}`, 60, 20))) {
      return json({ error: 'rate_limited', message: 'rate_limited' }, 429);
    }
    if (!(await rateLimit(client, `places-dt:uid:${userId}`, 60, 20))) {
      return json({ error: 'rate_limited', message: 'rate_limited' }, 429);
    }
    const body = (await request.json()) as { placeId?: string; sessionToken?: string };
    const place = await placesDetails({
      placeId: String(body.placeId ?? ''),
      sessionToken: String(body.sessionToken ?? ''),
      apiKey: apiKey(),
    });
    return json(place, 200);
  } catch (e) {
    return fail(e);
  }
}
