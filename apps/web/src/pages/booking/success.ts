import type { APIRoute } from 'astro';

/** Viva sources sometimes still point at /booking/success; keep query string (s=orderCode). */
export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const dest = new URL('/booking/confirmed', url);
  dest.search = url.search;
  return Response.redirect(dest.toString(), 302);
};
