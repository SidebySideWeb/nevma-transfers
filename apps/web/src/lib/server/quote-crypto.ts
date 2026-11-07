import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256(secret, quoteId|expiresAt). */
export function signQuote(secret: string, quoteId: string, expiresAt: string): string {
  return createHmac('sha256', secret).update(`${quoteId}|${expiresAt}`).digest('hex');
}

export function verifyQuoteSignature(
  secret: string,
  quoteId: string,
  expiresAt: string,
  signature: string,
): boolean {
  if (!secret || !signature || typeof signature !== 'string') return false;
  const expected = signQuote(secret, quoteId, expiresAt);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function quoteSigningSecret(): string {
  return (process.env.QUOTE_SIGNING_SECRET ?? '').trim();
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', 'quote-ip').update(ip).digest('hex').slice(0, 32);
}
