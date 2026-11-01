import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Service-role Supabase client for apps/web server code only.
 * Importing this module from a client component fails the build (`server-only`).
 */
function readEnv(name: string): string {
  // Dynamic process.env lookup (avoids Vite replacing missing import.meta.env.* with undefined).
  const fromProcess = typeof process !== 'undefined' ? process.env[name] : undefined;
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[name];
  return (fromProcess || fromMeta || '').trim();
}

export function getServiceClient(): SupabaseClient<Database> {
  const url = readEnv('SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
