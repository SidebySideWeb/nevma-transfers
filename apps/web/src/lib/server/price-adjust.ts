import 'server-only';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';
import { getPaymentProvider } from './payments';
import { getSettings } from './settings';
import { toIsoWithOffset } from '../booking/time';

const Body = z.object({
  reference: z.string().min(1),
  addCents: z.number().int().positive(),
  breakdown: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      amount: z.number().int(),
    }),
  ),
  reason: z.string().min(1),
  emailLink: z.boolean().optional(),
  idempotencyKey: z.string().min(8),
});

/** Staff-only: bump booking total by waiting / extra-km and optionally open a Viva link for the delta. */
export async function internalPriceAdjust(raw: unknown) {
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  const db = bookingDb();
  const { rows } = await db.query<{
    id: string;
    price_cents: number;
    list_price_cents: number | null;
    customer_email: string;
    customer_name: string;
    customer_phone: string;
    status: string;
  }>(
    `select id, price_cents, list_price_cents, customer_email, customer_name, customer_phone, status
       from public.bookings where reference = $1`,
    [body.reference],
  );
  const b = rows[0];
  if (!b) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_booking',
    });
  }
  const list = b.list_price_cents ?? b.price_cents;
  const newPrice = b.price_cents + body.addCents;
  await db.query(
    `update public.bookings set
       price_cents = $2,
       list_price_cents = coalesce(list_price_cents, $3),
       price_override_reason = case
         when price_override_reason is null or price_override_reason = '' then $4
         else price_override_reason || '; ' || $4
       end,
       price_breakdown = $5::jsonb,
       vat_cents = round(($2::numeric * vat_rate_bp) / (10000 + vat_rate_bp))::int
     where id = $1::uuid`,
    [b.id, newPrice, list, body.reason, JSON.stringify(body.breakdown)],
  );

  let checkoutUrl: string | null = null;
  if (body.emailLink) {
    const settings = await getSettings();
    const order = await getPaymentProvider().createOrder({
      amountCents: body.addCents,
      reference: `${body.reference}-ADJ`,
      customerEmail: b.customer_email,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      paymentTimeoutSeconds: Math.max(60, (settings.holdMinutes || 20) * 60),
    });
    checkoutUrl = order.checkoutUrl;
    // Best-effort: store order on a payment row if the schema allows; ignore failures.
    try {
      await db.query(
        `insert into public.payments (booking_id, provider, viva_order_code, amount_cents, status, created_at)
         values ($1::uuid, 'viva', $2::bigint, $3, 'pending', now())`,
        [b.id, order.orderCode, body.addCents],
      );
    } catch {
      /* payments shape may differ */
    }
  }

  return {
    ok: true as const,
    reference: body.reference,
    addCents: body.addCents,
    newPriceCents: newPrice,
    checkoutUrl,
    holdExpiresAt: toIsoWithOffset(
      new Date(Date.now() + 20 * 60_000),
      (await getSettings()).timezone,
    ),
  };
}
