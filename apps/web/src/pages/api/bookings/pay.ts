import type { APIRoute } from 'astro';
import { payAgain } from '../../../lib/server/booking-service';
import { fail, json } from '../../../lib/server/http';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const visitorKey = getOrSetVisitorKey(cookies);
    const body = await request.json();
    const data = await payAgain(body, visitorKey);
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
