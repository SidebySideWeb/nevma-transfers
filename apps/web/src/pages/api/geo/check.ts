import type { APIRoute } from 'astro';
import { handleGeoCheck, siteOrigin } from '../../../lib/server/geo-api';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const visitorKey = getOrSetVisitorKey(cookies);
  return handleGeoCheck(request, visitorKey, clientAddress, siteOrigin());
};
