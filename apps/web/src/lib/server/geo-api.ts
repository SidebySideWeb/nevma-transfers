import 'server-only';
import { features, notFoundUnless } from '@tem/features';
import { inServiceArea } from '@tem/geo';
import { BookingError } from '../booking/types';
import { getPublicEnv } from '../env';
import { assertRateLimit } from './rate-limit';
import { assertSameOrigin } from './places-config';
import { json } from './http';

const NO_STORE = { 'cache-control': 'no-store' };

type Point = { lat: number; lng: number };

function parsePoint(raw: unknown): Point | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function collectPoints(body: Record<string, unknown>): Point[] {
  const out: Point[] = [];
  const single = parsePoint(body);
  if (single) out.push(single);
  if (Array.isArray(body.points)) {
    for (const p of body.points) {
      const pt = parsePoint(p);
      if (pt) out.push(pt);
    }
  }
  return out;
}

export function geoFail(err: unknown): Response {
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
  console.error(JSON.stringify({ level: 'error', code: 'geo_check_unhandled', detail }));
  return json({ error: 'invalid_request', message: 'invalid_request' }, 400, NO_STORE);
}

/**
 * POST /api/geo/check — whether coordinates lie inside the configured service area.
 * Used only when features().distancePricing is on; otherwise 404.
 * No Turnstile (keystroke / pick path). Rate-limited like Places.
 */
export async function handleGeoCheck(
  request: Request,
  visitorKey: string,
  ip: string | undefined,
  allowedOrigin: string,
): Promise<Response> {
  const off = notFoundUnless(features().distancePricing);
  if (off) return off;

  try {
    assertSameOrigin(request, allowedOrigin);
    const body = (await request.json()) as Record<string, unknown>;
    if (ip) await assertRateLimit(`geo-check:ip:${ip}`, 60, 30);
    await assertRateLimit(`geo-check:vid:${visitorKey}`, 60, 30);
    await assertRateLimit(`geo-check-day:vid:${visitorKey}`, 86400, 300);

    const points = collectPoints(body);
    if (!points.length) {
      return json(
        { error: 'invalid_request', message: 'lat/lng or points required' },
        400,
        NO_STORE,
      );
    }

    const area = features().serviceArea || 'attica';
    const inArea = points.every((p) => inServiceArea(p, area));
    return json({ inArea }, 200, NO_STORE);
  } catch (e) {
    return geoFail(e);
  }
}

export function siteOrigin(): string {
  return getPublicEnv().PUBLIC_SITE_URL;
}
