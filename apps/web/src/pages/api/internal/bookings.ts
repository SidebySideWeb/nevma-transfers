import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { fail, json } from '../../../lib/server/http';
import { createOfficeBooking } from '../../../lib/server/office-booking';
import { verifySignature } from '../../../lib/server/signing';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { staffUserId, rawBody } = await verifySignature(request);
    const body = JSON.parse(rawBody) as unknown;
    const data = await createOfficeBooking(body, staffUserId);
    return json(data, 201);
  } catch (e) {
    if (e instanceof BookingError) {
      const auth =
        e.message === 'bad_signature' ||
        e.message === 'timestamp_skew' ||
        e.message === 'not_staff' ||
        e.message === 'missing_signature_headers';
      return fail(e, auth ? 401 : undefined);
    }
    return fail(e);
  }
};
