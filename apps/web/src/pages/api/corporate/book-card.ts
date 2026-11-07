import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { createBooking } from '../../../lib/server/booking-service';
import {
  CorporateBookBody,
  corporateOff,
  failMember,
  requireMember,
  tagCompanyBooking,
  toQuoteCheckout,
} from '../../../lib/server/corporate';
import { json } from '../../../lib/server/http';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

/**
 * Card path for company members without pay-on-account: the normal Viva checkout, then the booking is
 * tagged with the company and guest. Confirmation still comes only from the verified Viva event.
 */
export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    const parsed = CorporateBookBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: parsed.error.message,
      });
    }
    const created = await createBooking(
      toQuoteCheckout(parsed.data, member),
      getOrSetVisitorKey(cookies),
      clientAddress,
      { skipTurnstile: true },
    );
    const bookingId = (created as { bookingId?: string }).bookingId;
    if (bookingId) await tagCompanyBooking(bookingId, member, parsed.data);
    return json(created);
  } catch (e) {
    return failMember(e);
  }
};
