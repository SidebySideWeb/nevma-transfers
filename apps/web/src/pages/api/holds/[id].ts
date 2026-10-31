import type { APIRoute } from 'astro';
import { releaseHold } from '../../../lib/server/booking-service';
import { fail } from '../../../lib/server/http';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, cookies }) => {
  try {
    const id = params.id;
    if (!id) {
      return fail(new Error('missing id'));
    }
    const visitorKey = getOrSetVisitorKey(cookies);
    await releaseHold(id, visitorKey);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
};
