import type { APIRoute } from 'astro';
import { createSanityClient, sanityConfigured } from '../../../lib/sanity/client';
import { listFeaturedRoutes } from '../../../lib/server/featured-routes';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

async function maxPopularRoutes(): Promise<number> {
  if (!sanityConfigured()) return 8;
  try {
    const n = await createSanityClient().fetch<number | null>(
      `*[_type == "bookingWidget" && _id == "bookingWidget"][0].maxPopularRoutes`,
    );
    if (typeof n === 'number' && n > 0) return Math.min(20, n);
  } catch {
    /* defaults */
  }
  return 8;
}

export const GET: APIRoute = async () => {
  try {
    const limit = await maxPopularRoutes();
    const routes = await listFeaturedRoutes(limit);
    return json(
      { routes },
      200,
      { 'cache-control': 'public, max-age=300, s-maxage=300' },
    );
  } catch (e) {
    return fail(e);
  }
};
