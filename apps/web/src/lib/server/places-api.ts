import 'server-only';
import { features } from '@tem/features';
import { areaBounds } from '@tem/geo';
import {
  PlacesError,
  PREFERRED_PLACE_TYPES,
  autocomplete as placesAutocomplete,
  placeDetails as placesDetails,
} from '@tem/places';
import { BookingError } from '../booking/types';
import { getPublicEnv } from '../env';
import { assertRateLimit } from './rate-limit';
import { assertSameOrigin, placesApiKey, placesBias, placesEnabled } from './places-config';
import { json } from './http';

const NO_STORE = { 'cache-control': 'no-store' };

export function placesOffResponse(): Response {
  return new Response(null, { status: 404, statusText: 'Not Found', headers: NO_STORE });
}

export function placesFail(err: unknown): Response {
  if (err instanceof PlacesError) {
    const status = err.code === 'places_unavailable' ? 503 : 400;
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'places_api',
        placesCode: err.code,
        detail: err.message.slice(0, 120),
      }),
    );
    return json(
      {
        error: err.code === 'places_unavailable' ? 'places_unavailable' : 'invalid_request',
        message: err.message,
      },
      status,
      NO_STORE,
    );
  }
  if (err instanceof BookingError && err.message === 'rate_limit') {
    return json({ error: 'rate_limited', message: 'rate_limited' }, 429, NO_STORE);
  }
  if (err instanceof Error && (err as Error & { code?: string }).code === 'cross_origin') {
    return json({ error: 'invalid_request', message: 'invalid_request' }, 400, NO_STORE);
  }
  if (err instanceof Error && err.message === 'rate_limit') {
    return json({ error: 'rate_limited', message: 'rate_limited' }, 429, NO_STORE);
  }
  const detail = err instanceof Error ? err.message.slice(0, 180) : 'unknown';
  console.error(JSON.stringify({ level: 'error', code: 'places_unhandled', detail }));
  return json({ error: 'places_unavailable', message: 'places_unavailable' }, 503, NO_STORE);
}

export async function handleAutocomplete(
  request: Request,
  visitorKey: string,
  ip: string | undefined,
  allowedOrigin: string,
): Promise<Response> {
  if (!placesEnabled()) return placesOffResponse();
  try {
    assertSameOrigin(request, allowedOrigin);
    const body = (await request.json()) as { input?: unknown; sessionToken?: unknown };
    if (ip) await assertRateLimit(`places-ac:ip:${ip}`, 60, 30);
    await assertRateLimit(`places-ac:vid:${visitorKey}`, 60, 30);
    await assertRateLimit(`places-ac-day:vid:${visitorKey}`, 86400, 300);

    const f = features();
    const suggestions = await placesAutocomplete({
      input: String(body.input ?? ''),
      sessionToken: String(body.sessionToken ?? ''),
      apiKey: placesApiKey(),
      ...(f.distancePricing
        ? {
            locationRestriction: areaBounds(f.serviceArea || 'attica'),
            preferPrimaryTypes: PREFERRED_PLACE_TYPES,
          }
        : { bias: placesBias() }),
    });
    return json({ suggestions }, 200, NO_STORE);
  } catch (e) {
    return placesFail(e);
  }
}

export async function handleDetails(
  request: Request,
  visitorKey: string,
  ip: string | undefined,
  allowedOrigin: string,
): Promise<Response> {
  if (!placesEnabled()) return placesOffResponse();
  try {
    assertSameOrigin(request, allowedOrigin);
    const body = (await request.json()) as { placeId?: unknown; sessionToken?: unknown };
    if (ip) await assertRateLimit(`places-dt:ip:${ip}`, 60, 20);
    await assertRateLimit(`places-dt:vid:${visitorKey}`, 60, 20);
    const place = await placesDetails({
      placeId: String(body.placeId ?? ''),
      sessionToken: String(body.sessionToken ?? ''),
      apiKey: placesApiKey(),
    });
    return json(place, 200, NO_STORE);
  } catch (e) {
    return placesFail(e);
  }
}

export function siteOrigin(): string {
  return getPublicEnv().PUBLIC_SITE_URL;
}
