import type { APIRoute } from 'astro';
import { cancelBooking } from '../../../lib/server/booking-service';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const body = await request.json();
    const data = await cancelBooking(body, clientAddress);
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
