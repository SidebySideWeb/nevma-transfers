import type { APIRoute } from 'astro';
import { BookingError } from '../../../../lib/booking/types';
import { internalDriverInvite } from '../../../../lib/server/driver-invite';
import { fail, json } from '../../../../lib/server/http';
import { verifySignature } from '../../../../lib/server/signing';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { rawBody } = await verifySignature(request);
    const body = JSON.parse(rawBody) as unknown;
    const data = await internalDriverInvite(body);
    return json(data);
  } catch (e) {
    if (e instanceof BookingError) {
      const auth =
        e.message === 'bad_signature' ||
        e.message === 'timestamp_skew' ||
        e.message === 'not_staff' ||
        e.message === 'missing_signature_headers';
      const staffConflict = e.message === 'staff_email';
      return fail(e, auth ? 401 : staffConflict ? 409 : undefined);
    }
    return fail(e);
  }
};
