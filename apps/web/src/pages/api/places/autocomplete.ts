import type { APIRoute } from 'astro';
import { handleAutocomplete, siteOrigin } from '../../../lib/server/places-api';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const visitorKey = getOrSetVisitorKey(cookies);
  return handleAutocomplete(request, visitorKey, clientAddress, siteOrigin());
};
