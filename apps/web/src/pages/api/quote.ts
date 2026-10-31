import type { APIRoute } from 'astro';
import { quote } from '../../lib/server/booking-service';
import { fail, json } from '../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const body = await request.json();
    const data = await quote(body, clientAddress);
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
