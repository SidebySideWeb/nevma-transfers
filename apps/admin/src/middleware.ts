import { defineMiddleware } from 'astro:middleware';
import { getStaffSession, signOut } from './lib/auth';
import { createSupabaseServerClient } from './lib/supabase';
import { driversEnabled } from './lib/drivers';

const PUBLIC = new Set(['/login', '/logout']);
const DRIVER_WELCOME = '/driver-welcome';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname === DRIVER_WELCOME && driversEnabled()) {
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
      if (driversEnabled()) {
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
  response.headers.set('X-Robots-Tag', 'noindex');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
