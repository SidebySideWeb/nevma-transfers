import type { APIRoute } from 'astro';
import { BookingError } from '../../../lib/booking/types';
import { createBooking } from '../../../lib/server/booking-service';
import {
  assertOnAccountAllowed,
  confirmOnAccount,
  CorporateBookBody,
  corporateOff,
  requireMember,
  toQuoteCheckout,
} from '../../../lib/server/corporate';
import { bookingDb } from '../../../lib/server/db';
import { fireOnConfirmed } from '../../../lib/server/hooks';
import { fail, json } from '../../../lib/server/http';
import { storeCancelToken } from '../../../lib/server/webhook-viva';
import { getOrSetVisitorKey } from '../../../lib/server/visitor';

export const prerender = false;

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
    const body = parsed.data;

    // Peek quote total for the credit check before creating.
    const { rows: qrows } = await bookingDb().query<{ prices: Record<string, { total?: number }> }>(
      `select prices from public.quotes where id = $1::uuid and expires_at > now()`,
      [body.quoteId],
    );
    const total = qrows[0]?.prices?.[body.classKey]?.total;
    if (total == null) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'quote_class',
      });
    }
    await assertOnAccountAllowed(member, total);

    const created = await createBooking(
      toQuoteCheckout(body, member),
      getOrSetVisitorKey(cookies),
      clientAddress,
      { skipPayment: true, skipTurnstile: true },
    );
    const bookingId = (created as { bookingId?: string }).bookingId;
    if (!bookingId) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'booking_missing',
      });
    }

    const confirmed = await confirmOnAccount({
      bookingId,
      companyId: member.companyId,
      bookedBy: member.userId,
      guestName: body.guestName,
      guestPhone: body.guestPhone,
      costCenter: body.costCenter,
      customerEmail: member.email,
      customerName: body.guestName,
    });

    // Same confirmation hook the verified Viva event uses (emails the member; failures are logged, not thrown).
    await fireOnConfirmed(confirmed.reference, await storeCancelToken(bookingId));

    return json({
      reference: confirmed.reference,
      paymentMethod: 'on_account',
      status: 'confirmed',
    });
  } catch (e) {
    if (e instanceof BookingError && e.message === 'unauthorized') return fail(e, 401);
    return fail(e);
  }
};
