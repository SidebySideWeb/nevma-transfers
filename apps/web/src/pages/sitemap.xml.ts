import type { APIRoute } from 'astro';
import { getPublishableRoutes } from '../lib/content/routes';
import { getPublishableClasses } from '../lib/content/vehicles';
import { LEGAL_SLUGS, STANDARD_SLUGS } from '../lib/sanity/pages';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.href || 'http://localhost:4321').replace(/\/$/, '');
  const [classes, routes] = await Promise.all([
    getPublishableClasses().catch(() => []),
    getPublishableRoutes().catch(() => []),
  ]);
  const urls = [
    '/',
    '/fleet',
    ...classes.map((c) => `/fleet/${c.key}`),
    '/services',
    ...routes.map((r) => `/routes/${r.slug}`),
    ...STANDARD_SLUGS.map((s) => `/${s}`),
    ...LEGAL_SLUGS.map((s) => `/${s}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (path) => `  <url>
    <loc>${base}${path === '/' ? '/' : path}</loc>
  </url>`,
  )
  .join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
