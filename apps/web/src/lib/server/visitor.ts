import 'server-only';
import type { AstroCookies } from 'astro';

const COOKIE = 'tem_vid';
const MAX_AGE = 60 * 60 * 24 * 30;

function randomVisitorKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
}

/** Read or mint the httpOnly visitor cookie. */
export function getOrSetVisitorKey(cookies: AstroCookies): string {
  const existing = cookies.get(COOKIE)?.value;
  if (existing && existing.length >= 16) return existing;
  const key = randomVisitorKey();
  cookies.set(COOKIE, key, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return key;
}

export function readVisitorKey(cookies: AstroCookies): string | undefined {
  return cookies.get(COOKIE)?.value;
}
