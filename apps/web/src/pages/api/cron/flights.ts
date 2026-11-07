import type { APIRoute } from 'astro';
import { features, notFoundUnless } from '@tem/features';
import { BookingError } from '../../../lib/booking/types';
import { runFlightCron } from '../../../lib/server/flight-tracking';
import { fail, json } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const off = notFoundUnless(features().flightTracking);
  if (off) return off;
  try {
    const expected = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!expected || auth !== `Bearer ${expected}`) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'unauthorized',
      });
    }
    const result = await runFlightCron();
    return json(result);
  } catch (e) {
    if (e instanceof BookingError && e.message === 'unauthorized') {
      return fail(e, 401);
    }
    return fail(e);
  }
};
