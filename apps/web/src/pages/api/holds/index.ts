import type { APIRoute } from 'astro';
import { createHold } from '../../../lib/server/booking-service';
import { fail, json } from '../../../lib/server/http';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const visitorKey = getOrSetVisitorKey(cookies);
    const body = await request.json();
    const data = await createHold(body, visitorKey, clientAddress);
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
