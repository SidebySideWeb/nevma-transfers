import { describe, expect, it } from 'vitest';
import { webServerEnvSchema } from './env';

describe('webServerEnvSchema', () => {
  it('rejects a missing required variable', () => {
    const result = webServerEnvSchema.safeParse({
      PUBLIC_SITE_URL: 'http://localhost:4321',
      PUBLIC_ADMIN_URL: 'http://localhost:4322',
      PUBLIC_TURNSTILE_SITE_KEY: 'test',
      PUBLIC_BOOKING_OPEN: 'false',
      SUPABASE_URL: 'https://example.supabase.co',
      // SUPABASE_SERVICE_ROLE_KEY missing
      SANITY_PROJECT_ID: 'abc',
      SANITY_DATASET: 'production',
      SANITY_READ_TOKEN: 'token',
      VIVA_CLIENT_ID: 'id',
      VIVA_CLIENT_SECRET: 'secret',
      VIVA_SOURCE_CODE: 'src',
      VIVA_MERCHANT_ID: 'mid',
      VIVA_API_KEY: 'key',
      VIVA_ENV: 'demo',
      RESEND_API_KEY: 're_key',
      RESEND_FROM_EMAIL: 'TEM Protection <bookings@example.com>',
      TURNSTILE_SECRET_KEY: 'secret',
      ADMIN_TO_WEB_SIGNING_SECRET: 'signing',
      CRON_SECRET: 'cron',
    });
    expect(result.success).toBe(false);
  });
});
