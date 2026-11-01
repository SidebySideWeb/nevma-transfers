import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { assertLeadTime, localToInstant, toIsoWithOffset } from '../booking/time';
import { BookingError } from '../booking/types';
import { rejectMoneyFields } from '../booking/validation';
import { bookingDb } from './db';
import { mapPgBookingError } from './http';
import { getPaymentProvider } from './payments';
import { getSettings } from './settings';
import { quoteTrip, sumExtras } from './trip-quote';

/** Viva checkout/v2 paymentTimeout accepted examples go up to 65535 s (~18.2 h). Cap holds to that. */
export const VIVA_MAX_PAYMENT_TIMEOUT_SECONDS = 65535;

const pickupLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const OfflineMethod = z.enum(['cash', 'bank_transfer', 'on_account']);

const OfficeBookingBody = z
  .object({
    idempotencyKey: z.uuid(),
    staffUserId: z.uuid(),
    customer: z
      .object({
        name: z.string().min(1),
        email: z.email(),
        phone: z.string().min(1),
      })
      .strict(),
    bookingType: z.enum(['transfer', 'hourly']),
    classKey: z.string().min(1),
    fromZone: z.string().min(1),
    toZone: z.string().min(1).optional(),
    hours: z.number().int().positive().optional(),
    pickupLocal,
    pickupAddress: z.string().min(1),
    dropoffAddress: z.string().min(1).optional(),
    flightNumber: z.string().optional(),
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    extras: z.array(z.string().min(1)).default([]),
    vehicleId: z.uuid().optional(),
    invoice: z
      .object({
        company: z.string().min(1),
        vat: z.string().min(1),
        taxOffice: z.string().min(1),
        address: z.string().min(1),
      })
      .strict()
      .optional(),
    notes: z.string().optional(),
    priceOverrideCents: z.number().int().nonnegative().optional(),
    priceOverrideReason: z.string().min(1).optional(),
    payment: z.enum(['link', 'offline_paid', 'offline_collect']),
    offlineMethod: OfflineMethod.optional(),
    emailCustomer: z.boolean().default(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.bookingType === 'transfer' && !v.toZone) {
      ctx.addIssue({ code: 'custom', message: 'toZone required', path: ['toZone'] });
    }
    if (v.bookingType === 'hourly' && v.hours == null) {
      ctx.addIssue({ code: 'custom', message: 'hours required', path: ['hours'] });
    }
    if (v.priceOverrideCents != null && !v.priceOverrideReason?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'priceOverrideReason required',
        path: ['priceOverrideReason'],
      });
    }
    if (v.payment !== 'link' && !v.offlineMethod) {
      ctx.addIssue({ code: 'custom', message: 'offlineMethod required', path: ['offlineMethod'] });
    }
  });

const OfficePaymentBody = z
  .object({
    idempotencyKey: z.uuid(),
    reference: z.string().min(1),
    method: OfflineMethod,
    note: z.string().optional(),
    amountCents: z.number().int().positive().optional(),
  })
  .strict();

export type OfficeBookingResult = {
  reference: string;
  status: string;
  paymentStatus: string;
  checkoutUrl?: string;
  vivaTimeoutCapped?: boolean;
};

export async function createOfficeBooking(
  raw: unknown,
  staffUserId: string,
): Promise<OfficeBookingResult> {
  rejectMoneyFields(raw, ['priceOverrideCents']);
  const parsed = OfficeBookingBody.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  if (body.staffUserId !== staffUserId) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'staff_mismatch',
    });
  }

  // Idempotency: return first result
  const existing = await bookingDb().query<{
    reference: string;
    status: string;
    payment_status: string;
    viva_order_code: string | null;
  }>(
    `select reference, status, payment_status, viva_order_code::text
       from public.bookings
      where visitor_key = $1`,
    [`office-idem:${body.idempotencyKey}`],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return {
      reference: row.reference,
      status: row.status,
      paymentStatus: row.payment_status,
    };
  }

  const settings = await getSettings();
  const pickup = localToInstant(body.pickupLocal, settings.timezone);
  assertLeadTime(pickup, new Date(), settings.minLeadMinutes);

  const trip = await quoteTrip({
    type: body.bookingType,
    classKey: body.classKey,
    fromZone: body.fromZone,
    toZone: body.toZone,
    hours: body.hours,
    passengers: body.passengers,
    luggage: body.luggage,
  });
  const extras = await sumExtras(body.extras);
  const listPriceCents = trip.baseCents + extras.totalCents;
  const priceCents = body.priceOverrideCents ?? listPriceCents;
  const overrideReason =
    body.priceOverrideCents != null && body.priceOverrideCents !== listPriceCents
      ? body.priceOverrideReason!.trim()
      : null;

  const wantedHoldMinutes =
    body.payment === 'link'
      ? Math.min(
          settings.officeLinkHoldMinutes,
          Math.floor(VIVA_MAX_PAYMENT_TIMEOUT_SECONDS / 60),
        )
      : 5;
  const vivaTimeoutCapped =
    body.payment === 'link' &&
    settings.officeLinkHoldMinutes * 60 > VIVA_MAX_PAYMENT_TIMEOUT_SECONDS;

  let hold: { id: string; expires_at: Date; blocked_range: unknown };
  try {
    const { rows } = await bookingDb().query<{
      id: string;
      expires_at: Date;
      blocked_range: unknown;
    }>(
      `select id, expires_at, blocked_range
         from public.create_office_hold($1::text, $2::timestamptz, $3::int, $4::uuid, $5::int)`,
      [body.classKey, pickup.toISOString(), trip.durationMinutes, staffUserId, wantedHoldMinutes],
    );
    hold = rows[0]!;
  } catch (e) {
    throw mapPgBookingError(e);
  }

  const inv = body.invoice;
  const invoiceStatus = inv ? 'requested' : 'not_required';
  const paymentMethod =
    body.payment === 'link' ? 'viva' : (body.offlineMethod as 'cash' | 'bank_transfer' | 'on_account');
  const status = body.payment === 'link' ? 'pending' : 'confirmed';
  const paymentStatus = body.payment === 'offline_paid' ? 'paid' : 'unpaid';
  const holdExpiresAt = body.payment === 'link' ? hold.expires_at : null;
  const cancelToken = randomBytes(24).toString('hex');
  const cancelHash = createHash('sha256').update(cancelToken).digest('hex');

  let booking: {
    id: string;
    reference: string;
    status: string;
    payment_status: string;
  };

  try {
    await bookingDb().query('begin');
    const { rows } = await bookingDb().query<{
      id: string;
      reference: string;
      status: string;
      payment_status: string;
    }>(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, hours, duration_minutes, blocked_range,
         passengers, luggage, flight_number, customer_name, customer_email, customer_phone, notes,
         base_price_cents, price_cents, list_price_cents, price_override_reason,
         status, hold_expires_at, payment_status, payment_method,
         invoice_status, invoice_company, invoice_vat, invoice_tax_office, invoice_address,
         visitor_key, cancel_token_hash, source, created_by, vip_security, vehicle_id
       ) values (
         $1::public.booking_type, $2::uuid, $3::uuid, $4::uuid,
         $5, $6, $7::timestamptz, $8::int, $9::int, $10::tstzrange,
         $11::int, $12::int, $13, $14, $15, $16, $17,
         $18::int, $19::int, $20::int, $21,
         $22::public.booking_status, $23::timestamptz, $24::public.payment_status, $25,
         $26::public.invoice_status, $27, $28, $29, $30,
         $31, $32, 'office', $33::uuid, $34, $35::uuid
       )
       returning id, reference, status, payment_status`,
      [
        body.bookingType,
        trip.classRow.id,
        trip.fromId,
        trip.toId,
        body.pickupAddress,
        body.bookingType === 'transfer' ? (body.dropoffAddress ?? null) : null,
        pickup.toISOString(),
        trip.hours,
        trip.durationMinutes,
        hold.blocked_range,
        body.passengers,
        body.luggage,
        body.flightNumber ?? null,
        body.customer.name,
        body.customer.email,
        body.customer.phone,
        body.notes ?? null,
        trip.baseCents,
        priceCents,
        listPriceCents,
        overrideReason,
        status,
        holdExpiresAt,
        paymentStatus,
        paymentMethod,
        invoiceStatus,
        inv?.company ?? null,
        inv?.vat ?? null,
        inv?.taxOffice ?? null,
        inv?.address ?? null,
        `office-idem:${body.idempotencyKey}`,
        body.payment === 'link' ? null : cancelHash,
        staffUserId,
        extras.vipSecurity,
        body.vehicleId ?? null,
      ],
    );
    booking = rows[0]!;

    for (const line of extras.lines) {
      await bookingDb().query(
        `insert into public.booking_extras (booking_id, extra_id, quantity, price_cents)
         values ($1::uuid, $2::uuid, $3::int, $4::int)`,
        [booking.id, line.id, line.quantity, line.cents],
      );
    }

    if (body.vehicleId) {
      const { rows: veh } = await bookingDb().query<{ id: string; class_id: string; status: string }>(
        `select id, class_id, status from public.vehicles where id = $1::uuid`,
        [body.vehicleId],
      );
      if (!veh[0] || veh[0].class_id !== trip.classRow.id || veh[0].status !== 'active') {
        throw new BookingError('invalid_request', {
          stringKey: 'error.invalid_request',
          message: 'vehicle not free',
          field: 'vehicleId',
        });
      }
      const nextStatus = status === 'confirmed' ? 'assigned' : status;
      await bookingDb().query(
        `update public.bookings set vehicle_id = $1::uuid, status = $2::public.booking_status where id = $3::uuid`,
        [body.vehicleId, nextStatus, booking.id],
      );
      booking.status = nextStatus;
    }

    await bookingDb().query(
      `update public.slot_holds
          set status = 'converted', booking_id = $1::uuid
        where id = $2::uuid`,
      [booking.id, hold.id],
    );

    if (body.payment === 'offline_paid') {
      await bookingDb().query(
        `insert into public.payments (
           booking_id, kind, status, amount_cents, method, note, created_by, idempotency_key
         ) values ($1::uuid, 'payment', 'succeeded', $2::int, $3, $4, $5::uuid, $6)`,
        [
          booking.id,
          priceCents,
          paymentMethod,
          'Paid offline at creation',
          staffUserId,
          body.idempotencyKey,
        ],
      );
    }

    await bookingDb().query('commit');
  } catch (e) {
    await bookingDb().query('rollback').catch(() => undefined);
    // Unique visitor_key / idempotency race
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('exclusion')) {
      const again = await bookingDb().query<{
        reference: string;
        status: string;
        payment_status: string;
      }>(`select reference, status, payment_status from public.bookings where visitor_key = $1`, [
        `office-idem:${body.idempotencyKey}`,
      ]);
      if (again.rows[0]) {
        return {
          reference: again.rows[0].reference,
          status: again.rows[0].status,
          paymentStatus: again.rows[0].payment_status,
        };
      }
      if (msg.includes('exclusion')) {
        throw new BookingError('unavailable', {
          stringKey: 'error.unavailable',
          message: 'vehicle overlap',
          field: 'vehicleId',
        });
      }
    }
    if (e instanceof BookingError) throw e;
    throw mapPgBookingError(e);
  }

  let checkoutUrl: string | undefined;
  if (body.payment === 'link') {
    const timeoutSec = Math.max(
      1,
      Math.min(
        VIVA_MAX_PAYMENT_TIMEOUT_SECONDS,
        Math.floor((new Date(hold.expires_at).getTime() - Date.now()) / 1000),
      ),
    );
    try {
      const order = await getPaymentProvider().createOrder({
        amountCents: priceCents,
        reference: booking.reference,
        customerEmail: body.customer.email,
        customerName: body.customer.name,
        customerPhone: body.customer.phone,
        paymentTimeoutSeconds: timeoutSec,
      });
      await bookingDb().query(
        `update public.bookings set viva_order_code = $1::bigint where id = $2::uuid`,
        [order.orderCode, booking.id],
      );
      checkoutUrl = order.checkoutUrl;
    } catch {
      throw Object.assign(
        new BookingError('payment_failed', {
          stringKey: 'error.payment_failed',
          message: 'payment_failed',
        }),
        { reference: booking.reference },
      );
    }

    if (body.emailCustomer && checkoutUrl) {
      const { sendPaymentLinkEmail } = await import('./booking-emails');
      await sendPaymentLinkEmail(booking.reference, checkoutUrl, toIsoWithOffset(
        new Date(hold.expires_at),
        settings.timezone,
      ));
    }
  } else if (body.emailCustomer) {
    const { sendConfirmationEmails } = await import('./booking-emails');
    await sendConfirmationEmails(booking.reference, cancelToken, { notifyOffice: false });
  }

  return {
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.payment_status,
    checkoutUrl,
    vivaTimeoutCapped: vivaTimeoutCapped || undefined,
  };
}

export async function recordOfflinePayment(raw: unknown, staffUserId: string) {
  rejectMoneyFields(raw, ['amountCents']);
  const parsed = OfficePaymentBody.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;

  const existing = await bookingDb().query<{
    id: string;
    amount_cents: number;
    status: string;
  }>(`select id, amount_cents, status from public.payments where idempotency_key = $1`, [
    body.idempotencyKey,
  ]);
  if (existing.rows[0]) {
    const { rows: b } = await bookingDb().query<{ payment_status: string }>(
      `select payment_status from public.bookings where reference = $1`,
      [body.reference],
    );
    return {
      paymentStatus: b[0]?.payment_status ?? 'paid',
      amountCents: existing.rows[0].amount_cents,
    };
  }

  const { rows } = await bookingDb().query<{
    id: string;
    price_cents: number;
    payment_status: string;
    payment_method: string | null;
    source: string;
  }>(
    `select id, price_cents, payment_status, payment_method, source
       from public.bookings where reference = $1`,
    [body.reference],
  );
  const booking = rows[0];
  if (!booking) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_booking',
    });
  }
  if (booking.payment_status === 'paid') {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'already_paid',
    });
  }

  const amount = body.amountCents ?? booking.price_cents;
  try {
    await bookingDb().query(
      `insert into public.payments (
         booking_id, kind, status, amount_cents, method, note, created_by, idempotency_key
       ) values ($1::uuid, 'payment', 'succeeded', $2::int, $3, $4, $5::uuid, $6)`,
      [booking.id, amount, body.method, body.note ?? null, staffUserId, body.idempotencyKey],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { paymentStatus: 'paid', amountCents: amount };
    }
    throw e;
  }

  await bookingDb().query(
    `update public.bookings
        set payment_status = 'paid',
            payment_method = coalesce(payment_method, $1)
      where id = $2::uuid`,
    [body.method, booking.id],
  );

  return { paymentStatus: 'paid' as const, amountCents: amount };
}
