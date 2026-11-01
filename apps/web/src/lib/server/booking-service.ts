import 'server-only';
import { createHash } from 'node:crypto';
import { formatEuro, quoteHourly, quoteTransfer } from '../booking/pricing';
import { assertLeadTime, formatLocal, localToInstant, toIsoWithOffset } from '../booking/time';
import { BookingError } from '../booking/types';
import {
  BookingRequest,
  CancelRequest,
  HoldRequest,
  QuoteRequest,
  rejectMoneyFields,
} from '../booking/validation';
import { bookingDb, type BookingDb } from './db';
import { mapPgBookingError } from './http';
import { fireOnCancelled } from './hooks';
import { getPaymentProvider } from './payments';
import { assertRateLimit, RATE } from './rate-limit';
import { getSettings } from './settings';
import { verifyTurnstile } from './turnstile';

export type SanityVehicleClass = {
  key: string;
  name: string;
  tagline?: string | null;
  photos?: { url?: string | null; alt?: string | null }[] | null;
};

let sanityClasses: SanityVehicleClass[] | null = null;
const missingSanityLogged = new Set<string>();

/** Inject Sanity vehicle class content (or test stubs). Null = fetch/empty. */
export function setSanityVehicleClasses(classes: SanityVehicleClass[] | null): void {
  sanityClasses = classes;
  missingSanityLogged.clear();
}

export async function requireTurnstile(token: string | undefined, ip?: string): Promise<void> {
  if (!token || !(await verifyTurnstile(token, ip))) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'turnstile_failed',
      field: 'turnstileToken',
    });
  }
}

function db(): BookingDb {
  return bookingDb();
}

async function zoneByCode(code: string): Promise<{ id: string; code: string; name: string }> {
  const { rows } = await db().query<{ id: string; code: string; name: string }>(
    `select id, code, name from public.zones where code = $1 and active`,
    [code],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: `unknown zone ${code}`,
      field: code.includes('from') ? 'fromZone' : 'toZone',
    });
  }
  return rows[0];
}

async function routeDuration(fromId: string, toId: string): Promise<number> {
  const { rows } = await db().query<{ duration_minutes: number }>(
    `select duration_minutes from public.zone_routes where from_zone_id = $1 and to_zone_id = $2`,
    [fromId, toId],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown route',
    });
  }
  return rows[0].duration_minutes;
}

// ---------------------------------------------------------------------------
// GET /api/booking-options
// ---------------------------------------------------------------------------

async function loadSanityClasses(): Promise<SanityVehicleClass[]> {
  if (sanityClasses) return sanityClasses;
  try {
    const { createSanityClient } = await import('../sanity/client');
    const { VEHICLE_CLASSES_QUERY } = await import('../sanity/queries');
    const client = createSanityClient();
    const rows = await client.fetch<
      {
        key: string;
        name: string;
        tagline?: string | null;
        photos?: { alt?: string | null; asset?: { url?: string | null } | null }[] | null;
      }[]
    >(VEHICLE_CLASSES_QUERY);
    return (rows ?? []).map((r) => ({
      key: r.key,
      name: r.name,
      tagline: r.tagline,
      photos: (r.photos ?? []).map((p) => ({ url: p.asset?.url ?? null, alt: p.alt ?? null })),
    }));
  } catch {
    return [];
  }
}

export async function bookingOptions() {
  const settings = await getSettings();
  const classesContent = await loadSanityClasses();

  const zones = (
    await db().query<{ code: string; name: string }>(
      `select code, name from public.zones where active order by sort_order, code`,
    )
  ).rows;

  const classRows = (
    await db().query<{
      key: string;
      max_passengers: number;
      max_luggage: number;
      min_hours: number | null;
      max_hours: number | null;
    }>(
      `select c.key, c.max_passengers, c.max_luggage, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.active
        order by c.sort_order, c.key`,
    )
  ).rows;

  const byKey = new Map(classesContent.map((c) => [c.key, c]));
  const classes = [];
  for (const row of classRows) {
    const content = byKey.get(row.key);
    if (!content && !missingSanityLogged.has(row.key)) {
      missingSanityLogged.add(row.key);
      console.error(JSON.stringify({ level: 'warn', code: 'missing_sanity_class', key: row.key }));
    }
    // Fall back to the Postgres key so booking still works when Sanity is empty/offline.
    const name = content?.name ?? row.key;
    const photo = content?.photos?.[0];
    classes.push({
      key: row.key,
      name,
      maxPassengers: row.max_passengers,
      maxLuggage: row.max_luggage,
      hourly:
        row.min_hours != null && row.max_hours != null
          ? { minHours: row.min_hours, maxHours: row.max_hours }
          : null,
      photo: photo?.url ? { url: photo.url, alt: photo.alt ?? name } : null,
      tagline: content?.tagline ?? null,
    });
  }

  const extras = (
    await db().query<{ code: string; name: string; price_cents: number }>(
      `select code, name, price_cents from public.extras where active order by code`,
    )
  ).rows.map((e) => ({ code: e.code, name: e.name, priceCents: e.price_cents }));

  return {
    timezone: settings.timezone,
    minLeadMinutes: settings.minLeadMinutes,
    holdMinutes: settings.holdMinutes,
    zones: zones.map((z) => ({ code: z.code, name: z.name })),
    classes,
    extras,
  };
}

// ---------------------------------------------------------------------------
// POST /api/quote
// ---------------------------------------------------------------------------

export async function quote(raw: unknown, ip?: string) {
  rejectMoneyFields(raw);
  if (ip) await assertRateLimit(`quote:ip:${ip}`, RATE.quotePerIp.windowSeconds, RATE.quotePerIp.max);

  const parsed = QuoteRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  const settings = await getSettings();
  const pickup = localToInstant(body.pickupLocal, settings.timezone);
  assertLeadTime(pickup, new Date(), settings.minLeadMinutes);

  const from = await zoneByCode(body.fromZone);
  let toId: string | null = null;
  let durationMinutes: number;

  if (body.type === 'transfer') {
    if (body.fromZone === body.toZone) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'from and to must differ',
        field: 'toZone',
      });
    }
    const to = await zoneByCode(body.toZone);
    toId = to.id;
    durationMinutes = await routeDuration(from.id, to.id);
  } else {
    durationMinutes = body.hours * 60;
  }

  const classes = (
    await db().query<{
      id: string;
      key: string;
      max_passengers: number;
      max_luggage: number;
      buffer_minutes: number;
      rate_cents: number | null;
      min_hours: number | null;
      max_hours: number | null;
    }>(
      `select c.id, c.key, c.max_passengers, c.max_luggage, c.buffer_minutes,
              h.price_per_hour_cents as rate_cents, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.active
          and c.max_passengers >= $1
          and c.max_luggage >= $2
        order by c.sort_order`,
      [body.passengers, body.luggage],
    )
  ).rows;

  const options: {
    classKey: string;
    baseCents: number | null;
    available: boolean;
    reason?: string;
  }[] = [];

  let anyPrice = false;

  for (const c of classes) {
    let baseCents: number | null = null;
    let reason: string | undefined;

    if (body.type === 'transfer') {
      const { rows: prices } = await db().query<{ price_cents: number }>(
        `select price_cents from public.zone_prices
          where from_zone_id = $1 and to_zone_id = $2 and class_id = $3`,
        [from.id, toId, c.id],
      );
      if (!prices[0]) {
        baseCents = null;
        reason = 'no_price';
      } else {
        baseCents = quoteTransfer({ zonePriceCents: prices[0].price_cents });
        anyPrice = true;
      }
    } else {
      if (c.rate_cents == null || c.min_hours == null || c.max_hours == null) {
        baseCents = null;
        reason = 'no_price';
      } else {
        try {
          baseCents = quoteHourly({
            rateCents: c.rate_cents,
            minHours: c.min_hours,
            maxHours: c.max_hours,
            hours: body.hours,
          });
          anyPrice = true;
        } catch (e) {
          if (e instanceof BookingError && e.stringKey === 'error.hours_range') throw e;
          baseCents = null;
          reason = 'no_price';
        }
      }
    }

    let available = false;
    if (baseCents != null) {
      const { rows: avail } = await db().query<{ n: number }>(
        `select public.class_availability(
           $1::uuid,
           public.blocked_range_for($2::timestamptz, $3::int, $4::int)
         ) as n`,
        [c.id, pickup.toISOString(), durationMinutes, c.buffer_minutes],
      );
      available = (avail[0]?.n ?? 0) > 0;
    }

    options.push({
      classKey: c.key,
      baseCents,
      available,
      ...(reason ? { reason } : {}),
    });
  }

  if (!anyPrice) {
    throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
  }

  return {
    pickupAt: toIsoWithOffset(pickup, settings.timezone),
    durationMinutes,
    currency: 'EUR',
    options,
  };
}

// ---------------------------------------------------------------------------
// POST /api/holds
// ---------------------------------------------------------------------------

export async function createHold(raw: unknown, visitorKey: string, ip?: string) {
  rejectMoneyFields(raw);
  const parsed = HoldRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  await requireTurnstile(body.turnstileToken, ip);
  if (ip) await assertRateLimit(`hold:ip:${ip}`, RATE.holdPerIp.windowSeconds, RATE.holdPerIp.max);
  await assertRateLimit(
    `hold:vid:${visitorKey}`,
    RATE.holdPerVisitor.windowSeconds,
    RATE.holdPerVisitor.max,
  );

  const settings = await getSettings();
  const pickup = localToInstant(body.pickupLocal, settings.timezone);
  assertLeadTime(pickup, new Date(), settings.minLeadMinutes);

  const from = await zoneByCode(body.fromZone);
  let toId: string | null = null;
  let durationMinutes: number;
  let hours: number | null = null;
  let baseCents: number;

  const classRow = (
    await db().query<{
      id: string;
      key: string;
      max_passengers: number;
      max_luggage: number;
      buffer_minutes: number;
      rate_cents: number | null;
      min_hours: number | null;
      max_hours: number | null;
    }>(
      `select c.id, c.key, c.max_passengers, c.max_luggage, c.buffer_minutes,
              h.price_per_hour_cents as rate_cents, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.key = $1 and c.active`,
      [body.classKey],
    )
  ).rows[0];
  if (!classRow) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown class',
      field: 'classKey',
    });
  }
  if (classRow.max_passengers < body.passengers || classRow.max_luggage < body.luggage) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'class too small',
      field: 'classKey',
    });
  }

  if (body.type === 'transfer') {
    if (body.fromZone === body.toZone) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'from and to must differ',
        field: 'toZone',
      });
    }
    const to = await zoneByCode(body.toZone);
    toId = to.id;
    durationMinutes = await routeDuration(from.id, to.id);
    const { rows: prices } = await db().query<{ price_cents: number }>(
      `select price_cents from public.zone_prices
        where from_zone_id = $1 and to_zone_id = $2 and class_id = $3`,
      [from.id, to.id, classRow.id],
    );
    if (!prices[0]) {
      throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
    }
    baseCents = prices[0].price_cents;
  } else {
    hours = body.hours;
    durationMinutes = body.hours * 60;
    if (classRow.rate_cents == null || classRow.min_hours == null || classRow.max_hours == null) {
      throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
    }
    baseCents = quoteHourly({
      rateCents: classRow.rate_cents,
      minHours: classRow.min_hours,
      maxHours: classRow.max_hours,
      hours: body.hours,
    });
  }

  let hold: {
    id: string;
    expires_at: Date;
  };
  try {
    const { rows } = await db().query<{ id: string; expires_at: Date }>(
      `select id, expires_at from public.create_hold(
         $1::text, $2::timestamptz, $3::int, $4::text,
         $5::public.booking_type, $6::uuid, $7::uuid, $8::int
       )`,
      [
        body.classKey,
        pickup.toISOString(),
        durationMinutes,
        visitorKey,
        body.type,
        from.id,
        toId,
        hours,
      ],
    );
    hold = rows[0]!;
  } catch (e) {
    throw mapPgBookingError(e);
  }

  return {
    holdId: hold.id,
    expiresAt: toIsoWithOffset(new Date(hold.expires_at), settings.timezone),
    classKey: body.classKey,
    baseCents,
  };
}

// ---------------------------------------------------------------------------
// DELETE /api/holds/:id
// ---------------------------------------------------------------------------

export async function releaseHold(holdId: string, visitorKey: string): Promise<void> {
  const { rows } = await db().query<{ id: string }>(
    `update public.slot_holds
        set status = 'released'
      where id = $1::uuid
        and visitor_key = $2
        and status = 'active'
        and expires_at > now()
      returning id`,
    [holdId, visitorKey],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'hold not yours or ended',
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings
// ---------------------------------------------------------------------------

export async function createBooking(raw: unknown, visitorKey: string, ip?: string) {
  rejectMoneyFields(raw);
  const parsed = BookingRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  await requireTurnstile(body.turnstileToken, ip);
  if (ip) {
    await assertRateLimit(`book:ip:${ip}`, RATE.bookingPerIp.windowSeconds, RATE.bookingPerIp.max);
  }
  await assertRateLimit(
    `book:vid:${visitorKey}`,
    RATE.bookingPerVisitor.windowSeconds,
    RATE.bookingPerVisitor.max,
  );

  const inv = body.invoice;
  let created: {
    booking_id: string;
    reference: string;
    base_cents: number;
    price_cents: number;
    hold_expires_at: string;
    lines: { code: string; label: string; cents: number }[];
    class_key: string;
    currency: string;
  };
  try {
    const { rows } = await db().query<{ j: typeof created }>(
      `select public.create_booking_from_hold(
         $1::uuid, $2::text, $3::text, $4::text, $5::int, $6::int, $7::text, $8::text,
         $9::text[], $10::text, $11::text, $12::text,
         $13::text, $14::text, $15::text, $16::text
       ) as j`,
      [
        body.holdId,
        visitorKey,
        body.pickupAddress,
        body.dropoffAddress ?? null,
        body.passengers,
        body.luggage,
        body.flightNumber ?? null,
        body.notes ?? null,
        body.extras,
        body.customer.name,
        body.customer.email,
        body.customer.phone,
        inv?.company ?? null,
        inv?.vat ?? null,
        inv?.taxOffice ?? null,
        inv?.address ?? null,
      ],
    );
    created = rows[0]!.j;
  } catch (e) {
    throw mapPgBookingError(e);
  }

  const settings = await getSettings();
  const holdExpires = new Date(created.hold_expires_at);
  const timeoutSec = Math.max(1, Math.floor((holdExpires.getTime() - Date.now()) / 1000));

  try {
    const order = await getPaymentProvider().createOrder({
      amountCents: created.price_cents,
      reference: created.reference,
      customerEmail: body.customer.email,
      customerName: body.customer.name,
      customerPhone: body.customer.phone,
      paymentTimeoutSeconds: timeoutSec,
    });
    await db().query(`update public.bookings set viva_order_code = $1::bigint where id = $2::uuid`, [
      order.orderCode,
      created.booking_id,
    ]);

    return {
      reference: created.reference,
      status: 'pending' as const,
      currency: created.currency,
      lines: created.lines.map((l) => ({ label: l.label, cents: l.cents })),
      totalCents: created.price_cents,
      holdExpiresAt: toIsoWithOffset(holdExpires, settings.timezone),
      checkoutUrl: order.checkoutUrl,
    };
  } catch {
    throw Object.assign(
      new BookingError('payment_failed', {
        stringKey: 'error.payment_failed',
        message: 'payment_failed',
      }),
      { reference: created.reference },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings/pay
// ---------------------------------------------------------------------------

export async function payAgain(raw: unknown, visitorKey: string) {
  rejectMoneyFields(raw);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('reference' in raw) ||
    typeof (raw as { reference: unknown }).reference !== 'string'
  ) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'reference required',
    });
  }
  const reference = (raw as { reference: string }).reference;

  const { rows } = await db().query<{
    id: string;
    price_cents: number;
    hold_expires_at: Date | null;
    payment_status: string;
    status: string;
    customer_email: string;
    customer_name: string;
    customer_phone: string;
  }>(
    `select id, price_cents, hold_expires_at, payment_status, status,
            customer_email, customer_name, customer_phone
       from public.bookings
      where reference = $1 and visitor_key = $2`,
    [reference, visitorKey],
  );
  const b = rows[0];
  if (!b || b.status !== 'pending' || b.payment_status !== 'unpaid') {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'booking not payable',
    });
  }
  if (!b.hold_expires_at || new Date(b.hold_expires_at).getTime() <= Date.now()) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'hold ended',
    });
  }

  const timeoutSec = Math.max(
    1,
    Math.floor((new Date(b.hold_expires_at).getTime() - Date.now()) / 1000),
  );
  try {
    const order = await getPaymentProvider().createOrder({
      amountCents: b.price_cents,
      reference,
      customerEmail: b.customer_email,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      paymentTimeoutSeconds: timeoutSec,
    });
    await db().query(`update public.bookings set viva_order_code = $1::bigint where id = $2::uuid`, [
      order.orderCode,
      b.id,
    ]);
    return { checkoutUrl: order.checkoutUrl };
  } catch {
    throw new BookingError('payment_failed', {
      stringKey: 'error.payment_failed',
      message: 'payment_failed',
    });
  }
}

// ---------------------------------------------------------------------------
// GET /api/booking-status
// ---------------------------------------------------------------------------

export async function bookingStatus(orderCode: string) {
  const { rows } = await db().query<{
    reference: string;
    status: string;
    payment_status: string;
  }>(
    `select reference, status, payment_status from public.bookings where viva_order_code = $1::bigint`,
    [orderCode],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown order',
    });
  }
  return {
    reference: rows[0].reference,
    status: rows[0].status,
    paymentStatus: rows[0].payment_status,
  };
}

export type NotCompletedView =
  | { kind: 'expired' }
  | {
      kind: 'live';
      reference: string;
      holdExpiresAt: string;
      holdExpiresAtMs: number;
    };

/** Pending booking with a live hold for this visitor, looked up by Viva order code. */
export async function notCompletedView(
  orderCode: string | null | undefined,
  visitorKey: string | undefined,
): Promise<NotCompletedView> {
  if (!orderCode || !visitorKey) return { kind: 'expired' };
  const { rows } = await db().query<{
    reference: string;
    status: string;
    payment_status: string;
    hold_expires_at: Date | null;
  }>(
    `select reference, status, payment_status, hold_expires_at
       from public.bookings
      where viva_order_code = $1::bigint and visitor_key = $2`,
    [orderCode, visitorKey],
  );
  const b = rows[0];
  if (!b || b.status !== 'pending' || b.payment_status !== 'unpaid' || !b.hold_expires_at) {
    return { kind: 'expired' };
  }
  const expiresMs = new Date(b.hold_expires_at).getTime();
  if (expiresMs <= Date.now()) return { kind: 'expired' };
  const settings = await getSettings();
  return {
    kind: 'live',
    reference: b.reference,
    holdExpiresAt: toIsoWithOffset(new Date(b.hold_expires_at), settings.timezone),
    holdExpiresAtMs: expiresMs,
  };
}

/** End a pending hold so the visitor can pick another vehicle. */
export async function releasePendingBooking(raw: unknown, visitorKey: string): Promise<void> {
  rejectMoneyFields(raw);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('reference' in raw) ||
    typeof (raw as { reference: unknown }).reference !== 'string'
  ) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'reference required',
    });
  }
  const reference = (raw as { reference: string }).reference;
  const expired = await db().query(
    `update public.bookings
        set status = 'expired',
            hold_expires_at = least(coalesce(hold_expires_at, now()), now())
      where reference = $1
        and visitor_key = $2
        and status = 'pending'
        and payment_status = 'unpaid'
      returning id`,
    [reference, visitorKey],
  );
  if (!expired.rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'booking not releasable',
    });
  }
}

export type CancelPageView =
  | { kind: 'invalid' }
  | { kind: 'tooLate' }
  | {
      kind: 'ok';
      reference: string;
      pickupLabel: string;
      tripLabel: string;
      refundCents: number;
      refundLabel: string;
    };

/** Server data for `/booking/cancel/[token]` (never returns personal data). */
export async function cancelPageView(token: string): Promise<CancelPageView> {
  if (!token || token.length < 16) return { kind: 'invalid' };
  const hash = hashCancelToken(token);
  const { rows } = await db().query<{
    reference: string;
    pickup_at: Date;
    booking_type: string;
    duration_minutes: number;
    price_cents: number;
    payment_status: string;
    status: string;
    from_name: string | null;
    to_name: string | null;
  }>(
    `select b.reference, b.pickup_at, b.booking_type, b.duration_minutes, b.price_cents,
            b.payment_status, b.status,
            zf.name as from_name, zt.name as to_name
       from public.bookings b
       left join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id
      where b.cancel_token_hash = $1`,
    [hash],
  );
  const b = rows[0];
  if (!b || b.status === 'cancelled') return { kind: 'invalid' };

  const settings = await getSettings();
  const cutoff = new Date(b.pickup_at).getTime() - settings.cancelWindowHours * 3600_000;
  if (Date.now() > cutoff) return { kind: 'tooLate' };

  const refundCents =
    b.payment_status === 'paid' || b.payment_status === 'partially_refunded' ? b.price_cents : 0;
  const tripLabel =
    b.booking_type === 'hourly'
      ? `${Math.round(b.duration_minutes / 60)} h`
      : `${b.from_name ?? '—'} → ${b.to_name ?? '—'}`;

  return {
    kind: 'ok',
    reference: b.reference,
    pickupLabel: `${formatLocal(new Date(b.pickup_at), settings.timezone)} (Athens)`,
    tripLabel,
    refundCents,
    refundLabel: formatEuro(refundCents),
  };
}

// ---------------------------------------------------------------------------
// POST /api/bookings/cancel
// ---------------------------------------------------------------------------

export function hashCancelToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function cancelBooking(raw: unknown, ip?: string) {
  rejectMoneyFields(raw);
  const parsed = CancelRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  await requireTurnstile(body.turnstileToken, ip);

  const hash = hashCancelToken(body.token);
  const { rows } = await db().query<{
    id: string;
    reference: string;
    pickup_at: Date;
    price_cents: number;
    payment_status: string;
    viva_order_code: string | null;
    status: string;
  }>(
    `select id, reference, pickup_at, price_cents, payment_status, viva_order_code::text, status
       from public.bookings
      where cancel_token_hash = $1`,
    [hash],
  );
  const b = rows[0];
  if (!b || b.status === 'cancelled') {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown or used token',
    });
  }

  const settings = await getSettings();
  const cutoff = new Date(b.pickup_at).getTime() - settings.cancelWindowHours * 3600_000;
  if (Date.now() > cutoff) {
    throw new BookingError('invalid_request', {
      stringKey: 'booking.cancel.tooLate',
      message: 'booking.cancel.tooLate',
    });
  }

  let refundCents = 0;
  if (b.payment_status === 'paid' || b.payment_status === 'partially_refunded') {
    refundCents = b.price_cents;
    const { rows: payRows } = await db().query<{ viva_transaction_id: string }>(
      `select viva_transaction_id::text
         from public.payments
        where booking_id = $1::uuid and kind = 'payment' and status = 'succeeded'
          and viva_transaction_id is not null
        order by created_at asc limit 1`,
      [b.id],
    );
    const txId = payRows[0]?.viva_transaction_id;
    if (txId) {
      await getPaymentProvider().refund({
        transactionId: txId,
        amountCents: refundCents,
      });
    }
  }

  await db().query(
    `update public.bookings
        set status = 'cancelled',
            cancelled_at = now(),
            cancel_token_hash = null,
            payment_status = case
              when payment_status in ('paid', 'partially_refunded') then 'refunded'::public.payment_status
              else payment_status
            end
      where id = $1::uuid`,
    [b.id],
  );

  await fireOnCancelled(b.reference, refundCents);

  return {
    reference: b.reference,
    status: 'cancelled' as const,
    refundCents,
  };
}
