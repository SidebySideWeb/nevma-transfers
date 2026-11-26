import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { getServerEnv } from '../../../lib/env';
import { corporateOff } from '../../../lib/server/corporate';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

/**
 * Exchange a Supabase refresh token for a new access + refresh pair.
 * Uses the anon key server-side only (never SERVICE_ROLE, never PUBLIC_).
 */
export const POST: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const body = (await request.json().catch(() => null)) as { refreshToken?: string } | null;
    const refreshToken = String(body?.refreshToken || '').trim();
    if (!refreshToken) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'refresh_token_required',
      });
    }

    const env = getServerEnv();
    const url = env.SUPABASE_URL.replace(/\/$/, '');
    const anon =
      env.SUPABASE_ANON_KEY ||
      import.meta.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '';
    if (!anon) {
      throw new BookingError('service_unavailable', {
        stringKey: 'error.service_unavailable',
        message: 'auth_unavailable',
      });
    }

    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'refresh_failed',
      });
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token || !data.refresh_token) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'refresh_incomplete',
      });
    }

    return json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
  } catch (e) {
    if (e instanceof BookingError && e.message === 'refresh_failed') return fail(e, 401);
    return fail(e);
  }
};
