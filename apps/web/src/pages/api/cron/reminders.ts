import type { APIRoute } from 'astro';
import { runReminderCron } from '../../../lib/server/booking-emails';
import { fail, json } from '../../../lib/server/http';
import { BookingError } from '../../../lib/booking/types';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const expected = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!expected || auth !== `Bearer ${expected}`) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'unauthorized',
      });
    }
    const references = await runReminderCron();
    return json({ sent: references.length, references });
  } catch (e) {
    if (e instanceof BookingError && e.message === 'unauthorized') {
      return fail(e, 401);
    }
    return fail(e);
  }
};
