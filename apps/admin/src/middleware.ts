import { defineMiddleware } from 'astro:middleware';
import { getStaffSession, signOut } from './lib/auth';

const PUBLIC = new Set(['/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (!PUBLIC.has(pathname)) {
    const staff = await getStaffSession(context.cookies);
    if (!staff) {
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
