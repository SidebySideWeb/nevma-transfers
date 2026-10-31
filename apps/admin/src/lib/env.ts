import { z } from 'zod';

/** Public env for apps/admin. */
export const adminPublicEnvSchema = z.object({
  PUBLIC_SITE_URL: z.url(),
  PUBLIC_ADMIN_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
});

/** Full server env for apps/admin (ARCHITECTURE.md §6). */
export const adminServerEnvSchema = adminPublicEnvSchema.extend({
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_READ_TOKEN: z.string().min(1),
  ADMIN_TO_WEB_SIGNING_SECRET: z.string().min(1),
});

export type AdminPublicEnv = z.infer<typeof adminPublicEnvSchema>;
export type AdminServerEnv = z.infer<typeof adminServerEnvSchema>;

function rawPublic(): Record<string, string | undefined> {
  return {
    PUBLIC_SITE_URL: import.meta.env.PUBLIC_SITE_URL,
    PUBLIC_ADMIN_URL: import.meta.env.PUBLIC_ADMIN_URL,
    SUPABASE_URL: import.meta.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: import.meta.env.SUPABASE_ANON_KEY,
  };
}

function rawServer(): Record<string, string | undefined> {
  return {
    ...rawPublic(),
    SANITY_PROJECT_ID: import.meta.env.SANITY_PROJECT_ID,
    SANITY_DATASET: import.meta.env.SANITY_DATASET,
    SANITY_READ_TOKEN: import.meta.env.SANITY_READ_TOKEN,
    ADMIN_TO_WEB_SIGNING_SECRET: import.meta.env.ADMIN_TO_WEB_SIGNING_SECRET,
  };
}

function assertServerOnly(): void {
  if (import.meta.env.SSR === false) {
    throw new Error('Server environment variables cannot be imported in the browser bundle');
  }
}

export function getPublicEnv(): AdminPublicEnv {
  return adminPublicEnvSchema.parse(rawPublic());
}

/** Server-only. Throws if pulled into a client bundle. */
export function getServerEnv(): AdminServerEnv {
  assertServerOnly();
  return adminServerEnvSchema.parse(rawServer());
}
