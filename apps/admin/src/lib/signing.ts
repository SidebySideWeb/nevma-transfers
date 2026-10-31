import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256 hex of `timestamp.rawBody` — same scheme as apps/web `signing.ts`.
 * Secret is passed in so tests can use a fixed vector without env.
 */
export function signPayload(secret: string, body: string, timestamp: number | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function signWithEnv(body: string, timestamp: number | string): string {
  const secret =
    import.meta.env.ADMIN_TO_WEB_SIGNING_SECRET || process.env.ADMIN_TO_WEB_SIGNING_SECRET;
  if (!secret) {
    throw new Error('ADMIN_TO_WEB_SIGNING_SECRET is not set');
  }
  return signPayload(secret, body, timestamp);
}
