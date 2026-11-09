import type { APIRoute } from 'astro';
import { handlePinnedPlaces, siteOrigin } from '../../../lib/server/places-api';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  return handlePinnedPlaces(request, siteOrigin());
};
