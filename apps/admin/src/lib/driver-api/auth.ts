import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { driversEnabled } from '../drivers';
import { unauthorized } from './errors';

export type DriverClient = SupabaseClient<Database>;

function supabaseUrl(): string {
  return import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function supabaseAnon(): string {
  return import.meta.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
}

/** Bearer-token client. Never cookies, never service role. */
export function createDriverSupabase(accessToken: string): DriverClient {
  return createClient<Database>(supabaseUrl(), supabaseAnon(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function readBearer(request: Request): string | null {
  const h = request.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

export type DriverAuthOk = { ok: true; client: DriverClient; user: User };
export type DriverAuthFail = { ok: false; response: Response };

/** FEATURE_DRIVERS gate + Bearer auth. Does not check driver_me. */
export async function requireDriverAuth(request: Request): Promise<DriverAuthOk | DriverAuthFail> {
  if (!driversEnabled()) {
    return { ok: false, response: new Response(null, { status: 404 }) };
  }
  const token = readBearer(request);
  if (!token) return { ok: false, response: unauthorized() };
  const client = createDriverSupabase(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false, response: unauthorized() };
  return { ok: true, client, user: data.user };
}

export function earningsVisible(): boolean {
  const v = import.meta.env.DRIVER_EARNINGS_VISIBLE ?? process.env.DRIVER_EARNINGS_VISIBLE;
  return v === true || v === 'true';
}
