/**
 * Vercel Routing Middleware (Case B): HTTP Basic Auth when SITE_PASSWORD is set.
 * Runs before static and on-demand routes. Astro middleware cannot protect prerendered pages.
 * @see https://vercel.com/docs/routing-middleware
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { next } from '@vercel/functions';

export const config = {
  matcher: '/:path*',
};

/** Paths that must stay reachable without a browser password prompt. */
function isExcluded(pathname: string): boolean {
  return (
    pathname === '/api/webhooks/viva' ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/internal/') ||
    // Email clients (and Gmail's image proxy) cannot send Basic Auth.
    pathname === '/images/v2/logo-white.png' ||
    pathname === '/logo-white.png'
  );
}

function passwordsEqual(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Protected"',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function passwordFromAuthorization(header: string | null): string | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const colon = decoded.indexOf(':');
    // Username is ignored; password is everything after the first colon (or the whole string).
    return colon === -1 ? decoded : decoded.slice(colon + 1);
  } catch {
    return null;
  }
}

export default function middleware(request: Request): Response {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return next();
  }

  const pathname = new URL(request.url).pathname;
  if (isExcluded(pathname)) {
    return next();
  }

  const provided = passwordFromAuthorization(request.headers.get('authorization'));
  if (provided === null || !passwordsEqual(provided, expected)) {
    return unauthorized();
  }

  return next({
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
