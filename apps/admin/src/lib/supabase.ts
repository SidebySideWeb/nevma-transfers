import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';

function supabaseUrl(): string {
  return import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function supabaseAnon(): string {
  return import.meta.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
}

/** Cookie-aware Supabase client for Astro server code (session from Auth cookies). */
export function createSupabaseServerClient(cookies: AstroCookies) {
  return createServerClient<Database>(supabaseUrl(), supabaseAnon(), {
    cookies: {
      get(key: string) {
        return cookies.get(key)?.value;
      },
      set(key: string, value: string, options: CookieOptions) {
        cookies.set(key, value, options);
      },
      remove(key: string, options: CookieOptions) {
        cookies.delete(key, options);
      },
    },
  });
}
