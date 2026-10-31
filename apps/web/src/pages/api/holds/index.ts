import type { APIRoute } from 'astro';
import { isBookingOpen } from '../../../lib/booking-open';
import { BookingError } from '../../../lib/booking/types';
import { createHold } from '../../../lib/server/booking-service';
import { fail, json } from '../../../lib/server/http';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    if (!isBookingOpen()) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'booking_closed',
      });
    }
    const visitorKey = getOrSetVisitorKey(cookies);
    const body = await request.json();
    const data = await createHold(body, visitorKey, clientAddress);
    return json(data);
  } catch (e) {
    if (e instanceof BookingError && e.message === 'booking_closed') {
      return fail(e, 503);
    }
    return fail(e);
  }
};
