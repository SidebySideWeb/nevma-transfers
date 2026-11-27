import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { requestDriverPasswordReset } from '../../../lib/server/driver-password-reset';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

function driverAppOrigin(): string {
  const raw =
    import.meta.env.DRIVER_APP_ORIGIN ||
    process.env.DRIVER_APP_ORIGIN ||
    import.meta.env.DRIVER_APP_URL ||
    process.env.DRIVER_APP_URL ||
    '';
  return String(raw).replace(/\/$/, '');
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowed = driverAppOrigin();
  if (origin && allowed && origin === allowed) {
    return {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
  }
  return {};
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export const OPTIONS: APIRoute = async ({ request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request) });

export const POST: APIRoute = async ({ request }) => {
  const cors = corsHeaders(request);
  try {
    const raw = (await request.json()) as unknown;
    const data = await requestDriverPasswordReset(raw, { ip: clientIp(request) });
    return json(data, 200, cors);
  } catch (e) {
    if (e instanceof BookingError) {
      const res = fail(e);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }
    const res = fail(e);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  }
};
