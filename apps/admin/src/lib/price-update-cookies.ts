import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

export const PRICES_CHANGED_COOKIE = 'prices_changed';
export const REBUILD_REQUESTED_COOKIE = 'rebuild_requested_at';
export const REBUILD_COOLDOWN_MS = 2 * 60 * 1000;

function secret(): string {
  return (
    import.meta.env.ADMIN_TO_WEB_SIGNING_SECRET ||
    process.env.ADMIN_TO_WEB_SIGNING_SECRET ||
    'dev-admin-signing'
  );
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(body: string): string {
  const sig = createHmac('sha256', secret()).update(body).digest('hex');
  return `${body}.${sig}`;
}

function verify(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  if (i < 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = createHmac('sha256', secret()).update(body).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return body;
}

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: import.meta.env.PROD,
  maxAge: 60 * 60 * 24 * 7,
};

/** Mark that prices/catalog changed and the website should be rebuilt. */
export function markPricesChanged(cookies: AstroCookies): void {
  const body = b64url(JSON.stringify({ v: 1 }));
  cookies.set(PRICES_CHANGED_COOKIE, sign(body), cookieOpts);
}

export function clearPricesChanged(cookies: AstroCookies): void {
  cookies.delete(PRICES_CHANGED_COOKIE, { path: '/' });
}

export function hasPricesChanged(cookies: AstroCookies): boolean {
  const body = verify(cookies.get(PRICES_CHANGED_COOKIE)?.value);
  if (!body) return false;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as { v?: number };
    return payload.v === 1;
  } catch {
    return false;
  }
}

export function setRebuildRequestedAt(cookies: AstroCookies, atMs = Date.now()): void {
  const body = b64url(JSON.stringify({ at: atMs }));
  cookies.set(REBUILD_REQUESTED_COOKIE, sign(body), cookieOpts);
}

export function readRebuildRequestedAt(cookies: AstroCookies): number | null {
  const body = verify(cookies.get(REBUILD_REQUESTED_COOKIE)?.value);
  if (!body) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as { at?: number };
    return typeof payload.at === 'number' ? payload.at : null;
  } catch {
    return null;
  }
}

export function rebuildCooldownRemainingMs(cookies: AstroCookies, now = Date.now()): number {
  const at = readRebuildRequestedAt(cookies);
  if (at == null) return 0;
  return Math.max(0, at + REBUILD_COOLDOWN_MS - now);
}

/** Test helpers: produce signed cookie values without AstroCookies. */
export function signPricesChangedValue(): string {
  return sign(b64url(JSON.stringify({ v: 1 })));
}

export function signRebuildRequestedValue(atMs: number): string {
  return sign(b64url(JSON.stringify({ at: atMs })));
}
