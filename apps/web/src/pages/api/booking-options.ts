import type { APIRoute } from 'astro';
import { bookingOptions } from '../../lib/server/booking-service';
import { fail, json } from '../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const data = await bookingOptions();
    return json(data, 200, { 'cache-control': 'public, max-age=60' });
  } catch (e) {
    return fail(e);
  }
};
