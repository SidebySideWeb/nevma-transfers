import type { APIRoute } from 'astro';
import { releasePendingBooking } from '../../../lib/server/booking-service';
import { fail, json } from '../../../lib/server/http';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const visitorKey = getOrSetVisitorKey(cookies);
    const body = await request.json();
    await releasePendingBooking(body, visitorKey);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
};
