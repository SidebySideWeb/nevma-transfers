import { describe, expect, it } from 'vitest';
import { corsHeaders, preflight } from './cors';

describe('driver API CORS', () => {
  it('reflects only DRIVER_APP_ORIGIN; other origins get no CORS headers', () => {
    const prev = process.env.DRIVER_APP_ORIGIN;
    process.env.DRIVER_APP_ORIGIN = 'http://localhost:5173';
    try {
      const ok = corsHeaders(
        new Request('http://localhost:4322/api/driver/v1/me', {
          headers: { Origin: 'http://localhost:5173' },
        }),
      );
      expect(ok.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

      const bad = preflight(
        new Request('http://localhost:4322/api/driver/v1/me', {
          method: 'OPTIONS',
          headers: { Origin: 'https://evil.example' },
        }),
      );
      expect(bad.status).toBe(204);
      expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DRIVER_APP_ORIGIN;
      else process.env.DRIVER_APP_ORIGIN = prev;
    }
  });
});
