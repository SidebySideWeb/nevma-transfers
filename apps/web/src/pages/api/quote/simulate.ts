import type { APIRoute } from 'astro';
import { quote } from '../../../lib/server/booking-service';
import { fail, json } from '../../../lib/server/http';
import { verifySignature } from '../../../lib/server/signing';

export const prerender = false;

/**
 * POST /api/quote/simulate — same engine as /api/quote, no quote row.
 * Overrides require a staff HMAC (admin). Anon with overrides → 403.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const hasSig =
      request.headers.get('x-tem-signature') && request.headers.get('x-tem-staff');
    let isStaff = false;
    let body: unknown;
    if (hasSig) {
      const verified = await verifySignature(request);
      isStaff = true;
      body = JSON.parse(verified.rawBody) as unknown;
    } else {
      body = await request.json();
    }
    const data = await quote(body, clientAddress, { simulate: true, isStaff });
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
