/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    staff?: {
      userId: string;
      email: string;
    };
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_ADMIN_URL: string;
  readonly SANITY_PROJECT_ID: string;
  readonly SANITY_DATASET: string;
  readonly SANITY_READ_TOKEN: string;
  readonly ADMIN_TO_WEB_SIGNING_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
