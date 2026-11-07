import type { APIRoute } from 'astro';
import { features, notFoundUnless } from '@tem/features';
import { z } from 'zod';
import { BookingError } from '../../../../lib/booking/types';
import { checkBookingFlightNow } from '../../../../lib/server/flight-tracking';
import { bookingDb } from '../../../../lib/server/db';
import { fail, json } from '../../../../lib/server/http';
import { verifySignature } from '../../../../lib/server/signing';

export const prerender = false;

const Body = z.object({ reference: z.string().min(1) }).strict();

export const POST: APIRoute = async ({ request }) => {
  const off = notFoundUnless(features().flightTracking);
  if (off) return off;
  try {
    const { rawBody } = await verifySignature(request);
    const parsed = Body.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: parsed.error.message,
      });
    }
    const { rows } = await bookingDb().query<{ id: string }>(
      `select id from public.bookings where reference = $1`,
      [parsed.data.reference],
    );
    const id = rows[0]?.id;
    if (!id) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'unknown_booking',
      });
    }
    const out = await checkBookingFlightNow(id);
    return json({
      found: out.result.found,
      status: out.result.status,
      eta: out.result.eta,
      schedArr: out.result.schedArr,
      terminal: out.result.terminal,
      origin: out.result.origin,
      airline: out.result.airline,
      shifted: out.apply.shifted,
      conflict: out.apply.conflict ?? false,
      alert: out.apply.alert ?? null,
    });
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
