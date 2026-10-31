import { describe, expect, it } from 'vitest';
import { adminServerEnvSchema } from './env';

describe('adminServerEnvSchema', () => {
  it('rejects a missing required variable', () => {
    const result = adminServerEnvSchema.safeParse({
      PUBLIC_SITE_URL: 'http://localhost:4321',
      PUBLIC_ADMIN_URL: 'http://localhost:4322',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SANITY_PROJECT_ID: 'abc',
      SANITY_DATASET: 'production',
      // SANITY_READ_TOKEN missing
      ADMIN_TO_WEB_SIGNING_SECRET: 'signing',
    });
    expect(result.success).toBe(false);
  });
});
