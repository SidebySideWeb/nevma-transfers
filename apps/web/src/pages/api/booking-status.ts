import type { APIRoute } from 'astro';
import { BookingError } from '../../lib/booking/types';
import { bookingStatus } from '../../lib/server/booking-service';
import { fail, json } from '../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const s = url.searchParams.get('s');
    if (!s) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'missing s',
      });
    }
    const t = url.searchParams.get('t');
    const data = await bookingStatus(s, t);
    return json(data);
  } catch (e) {
    return fail(e);
  }
};
