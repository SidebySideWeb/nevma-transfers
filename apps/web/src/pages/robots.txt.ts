import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href || 'http://localhost:4321').replace(/\/$/, '');
  const body = `User-agent: *
Allow: /
Disallow: /book
Disallow: /booking/
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
