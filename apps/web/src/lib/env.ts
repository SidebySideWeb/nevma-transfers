import { z } from 'zod';

/** Public (browser-safe) env for apps/web. */
export const webPublicEnvSchema = z.object({
  PUBLIC_SITE_URL: z.url(),
  PUBLIC_ADMIN_URL: z.url(),
  PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  PUBLIC_BOOKING_OPEN: z.enum(['true', 'false']),
});

/** Full server env for apps/web (ARCHITECTURE.md §6). */
export const webServerEnvSchema = webPublicEnvSchema.extend({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_READ_TOKEN: z.string().min(1),
  VIVA_CLIENT_ID: z.string().min(1),
  VIVA_CLIENT_SECRET: z.string().min(1),
  VIVA_SOURCE_CODE: z.string().min(1),
  VIVA_MERCHANT_ID: z.string().min(1),
  VIVA_API_KEY: z.string().min(1),
  VIVA_ENV: z.enum(['demo', 'live']),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  ADMIN_TO_WEB_SIGNING_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(1),
});

export type WebPublicEnv = z.infer<typeof webPublicEnvSchema>;
export type WebServerEnv = z.infer<typeof webServerEnvSchema>;

function rawPublic(): Record<string, string | undefined> {
  return {
    PUBLIC_SITE_URL: import.meta.env.PUBLIC_SITE_URL,
    PUBLIC_ADMIN_URL: import.meta.env.PUBLIC_ADMIN_URL,
    PUBLIC_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
    PUBLIC_BOOKING_OPEN: import.meta.env.PUBLIC_BOOKING_OPEN,
  };
}

function rawServer(): Record<string, string | undefined> {
  return {
    ...rawPublic(),
    SUPABASE_URL: import.meta.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    SANITY_PROJECT_ID: import.meta.env.SANITY_PROJECT_ID,
    SANITY_DATASET: import.meta.env.SANITY_DATASET,
    SANITY_READ_TOKEN: import.meta.env.SANITY_READ_TOKEN,
    VIVA_CLIENT_ID: import.meta.env.VIVA_CLIENT_ID,
    VIVA_CLIENT_SECRET: import.meta.env.VIVA_CLIENT_SECRET,
    VIVA_SOURCE_CODE: import.meta.env.VIVA_SOURCE_CODE,
    VIVA_MERCHANT_ID: import.meta.env.VIVA_MERCHANT_ID,
    VIVA_API_KEY: import.meta.env.VIVA_API_KEY,
    VIVA_ENV: import.meta.env.VIVA_ENV,
    RESEND_API_KEY: import.meta.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: import.meta.env.RESEND_FROM_EMAIL,
    TURNSTILE_SECRET_KEY: import.meta.env.TURNSTILE_SECRET_KEY,
    ADMIN_TO_WEB_SIGNING_SECRET: import.meta.env.ADMIN_TO_WEB_SIGNING_SECRET,
    CRON_SECRET: import.meta.env.CRON_SECRET,
  };
}

function assertServerOnly(): void {
  if (import.meta.env.SSR === false) {
    throw new Error('Server environment variables cannot be imported in the browser bundle');
  }
}

export function getPublicEnv(): WebPublicEnv {
  return webPublicEnvSchema.parse(rawPublic());
}

/** Server-only. Throws if pulled into a client bundle. */
export function getServerEnv(): WebServerEnv {
  assertServerOnly();
  return webServerEnvSchema.parse(rawServer());
}
