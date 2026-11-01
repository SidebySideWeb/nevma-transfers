import type { APIRoute } from 'astro';
import { lookupBooking } from '../../../lib/server/booking-lookup';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const ctype = request.headers.get('content-type') || '';
    let body: unknown;
    if (ctype.includes('application/json')) {
      body = await request.json();
    } else {
      body = formToObject(await request.formData());
    }
    const data = await lookupBooking(body, clientAddress);
    if (!ctype.includes('application/json')) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/booking/find?sent=1',
          'cache-control': 'no-store',
        },
      });
    }
    return json(data);
  } catch (e) {
    const ctype = request.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      // No-JS: still land on find with sent=1 so we never leak match/fail
      // except Turnstile/rate-limit which fail() handles as JSON — for form posts
      // redirect anyway after logging would reveal; prefer fail for hard errors.
      return fail(e);
    }
    return fail(e);
  }
};
