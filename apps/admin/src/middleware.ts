import { createHash, timingSafeEqual } from 'node:crypto';
import { defineMiddleware } from 'astro:middleware';
import { getStaffSession, signOut } from './lib/auth';
import { createSupabaseServerClient } from './lib/supabase';
import { features } from '@tem/features';

const PUBLIC = new Set(['/login', '/logout']);
const DRIVER_WELCOME = '/driver-welcome';

function passwordsEqual(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function passwordFromAuthorization(header: string | null): string | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const colon = decoded.indexOf(':');
    return colon === -1 ? decoded : decoded.slice(colon + 1);
  } catch {
    return null;
  }
}

function sitePasswordUnauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Protected"',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Driver API uses Bearer tokens; never staff cookies, Basic Auth gate, or redirects.
  if (pathname.startsWith('/api/driver/v1')) {
    const response = await next();
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Optional deployment lock (same SITE_PASSWORD as apps/web). Unset = open.
  const sitePassword = import.meta.env.SITE_PASSWORD || process.env.SITE_PASSWORD;
  if (sitePassword) {
    const provided = passwordFromAuthorization(context.request.headers.get('authorization'));
    if (provided === null || !passwordsEqual(provided, sitePassword)) {
      return sitePasswordUnauthorized();
    }
  }

  if (pathname === DRIVER_WELCOME && features().drivers) {
    const supabase = createSupabaseServerClient(context.cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      await signOut(context.cookies);
      const login = new URL('/login', context.url);
      login.searchParams.set('error', 'auth');
      return context.redirect(login.pathname + login.search);
    }
    const { data: staff } = await supabase.from('staff').select('user_id').eq('user_id', user.id).maybeSingle();
    if (staff) {
      // Staff use the normal admin; skip welcome.
      context.locals.staff = await getStaffSession(context.cookies) ?? undefined;
      return next();
    }
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (!driver) {
      await signOut(context.cookies);
      const login = new URL('/login', context.url);
      login.searchParams.set('error', 'auth');
      return context.redirect(login.pathname + login.search);
    }
    // Driver session: allow only this page (handled by not setting staff).
    const response = await next();
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (!PUBLIC.has(pathname)) {
    const staff = await getStaffSession(context.cookies);
    if (!staff) {
      // Active driver may only use /driver-welcome — check before signing out.
      if (features().drivers) {
        const supabase = createSupabaseServerClient(context.cookies);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: driver } = await supabase
            .from('drivers')
            .select('id')
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();
          if (driver) return context.redirect(DRIVER_WELCOME);
        }
      }
      await signOut(context.cookies);
      const login = new URL('/login', context.url);
      login.searchParams.set('error', 'auth');
      return context.redirect(login.pathname + login.search);
    }
    context.locals.staff = staff;
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', sitePassword ? 'noindex, nofollow' : 'noindex');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
