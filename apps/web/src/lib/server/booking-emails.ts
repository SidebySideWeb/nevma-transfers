import 'server-only';
import { Temporal } from '@js-temporal/polyfill';
import { getSiteSettings, loadUiStrings } from '../sanity/content';
import { bookingDb } from './db';
import { sendEmail } from './email';
import {
  cancelledCustomerEmail,
  cancelledOfficeEmail,
  confirmationEmail,
  lateRefundEmail,
  manageLinkEmail,
  officeNewEmail,
  paymentLinkEmail,
  reminderEmail,
  type ExtraLine,
} from './email-templates';
import { getSettings } from './settings';

type BookingRow = {
  id: string;
  reference: string;
  booking_type: 'transfer' | 'hourly';
  pickup_at: Date;
  hours: number | null;
  passengers: number;
  base_price_cents: number;
  price_cents: number;
  vat_rate_bp: number;
  vat_cents: number;
  vip_security: boolean;
  invoice_status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string | null;
  flight_number: string | null;
  invoice_company: string | null;
  invoice_vat: string | null;
  invoice_tax_office: string | null;
  invoice_address: string | null;
  class_name: string;
  from_zone: string;
  to_zone: string | null;
  vehicle_label: string | null;
  vehicle_auto_assigned: boolean;
  pickup_address: string | null;
  dropoff_address: string | null;
  pickup_place_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_place_id: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  distance_km: number | null;
  duration_min: number | null;
  price_breakdown: { code?: string; label?: string; amount?: number }[] | null;
  guest_name: string | null;
  payment_method: string | null;
  account_company_name: string | null;
};

function pickupLocalAthens(pickup: Date): string {
  const zdt = Temporal.Instant.fromEpochMilliseconds(new Date(pickup).getTime()).toZonedDateTimeISO(
    'Europe/Athens',
  );
  const weekday = zdt.toLocaleString('en-GB', { weekday: 'short' });
  const day = zdt.day;
  const month = zdt.toLocaleString('en-GB', { month: 'short' });
  const year = zdt.year;
  const hour = String(zdt.hour).padStart(2, '0');
  const minute = String(zdt.minute).padStart(2, '0');
  return `${weekday} ${day} ${month} ${year}, ${hour}:${minute}`;
}

const BOOKING_SELECT_CORE = `select b.id, b.reference, b.booking_type, b.pickup_at, b.hours, b.passengers,
            b.base_price_cents, b.price_cents, b.vat_rate_bp, b.vat_cents,
            b.vip_security, b.invoice_status, b.customer_name, b.customer_email, b.customer_phone,
            b.notes, b.flight_number, b.invoice_company, b.invoice_vat, b.invoice_tax_office,
            b.invoice_address, c.name as class_name, zf.name as from_zone, zt.name as to_zone,
            v.label as vehicle_label, b.vehicle_auto_assigned,
            b.pickup_address, b.dropoff_address,
            b.distance_km, b.duration_min, b.price_breakdown,
            b.guest_name, b.payment_method::text as payment_method,
            co.name as account_company_name`;

const BOOKING_FROM = ` from public.bookings b
       join public.vehicle_classes c on c.id = b.class_id
       join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id
       left join public.vehicles v on v.id = b.vehicle_id
       left join public.companies co on co.id = b.company_id
      where b.reference = $1`;

async function loadBooking(reference: string): Promise<BookingRow | null> {
  try {
    const { rows } = await bookingDb().query<BookingRow>(
      `${BOOKING_SELECT_CORE},
            b.pickup_place_id, b.pickup_lat, b.pickup_lng,
            b.dropoff_place_id, b.dropoff_lat, b.dropoff_lng
       ${BOOKING_FROM}`,
      [reference],
    );
    return rows[0] ?? null;
  } catch (e) {
    // Migration 0021 not applied yet — still send confirmation; Maps links use address text.
    const detail = e instanceof Error ? e.message : '';
    if (
      !/pickup_place_id|dropoff_place_id|distance_km|duration_min|price_breakdown|guest_name|payment_method|companies/i.test(
        detail,
      )
    ) {
      throw e;
    }
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'booking_email_places_unavailable',
        reference,
        detail: detail.slice(0, 120),
      }),
    );
    const { rows } = await bookingDb().query<BookingRow>(
      `select b.id, b.reference, b.booking_type, b.pickup_at, b.hours, b.passengers,
              b.base_price_cents, b.price_cents, b.vat_rate_bp, b.vat_cents,
              b.vip_security, b.invoice_status, b.customer_name, b.customer_email, b.customer_phone,
              b.notes, b.flight_number, b.invoice_company, b.invoice_vat, b.invoice_tax_office,
              b.invoice_address, c.name as class_name, zf.name as from_zone, zt.name as to_zone,
              v.label as vehicle_label, b.vehicle_auto_assigned,
              b.pickup_address, b.dropoff_address,
              null::float8 as distance_km, null::int as duration_min, null::jsonb as price_breakdown,
              null::text as guest_name, null::text as payment_method, null::text as account_company_name,
              null::text as pickup_place_id, null::float8 as pickup_lat, null::float8 as pickup_lng,
              null::text as dropoff_place_id, null::float8 as dropoff_lat, null::float8 as dropoff_lng
         from public.bookings b
         join public.vehicle_classes c on c.id = b.class_id
         join public.zones zf on zf.id = b.from_zone_id
         left join public.zones zt on zt.id = b.to_zone_id
         left join public.vehicles v on v.id = b.vehicle_id
        where b.reference = $1`,
      [reference],
    );
    return rows[0] ?? null;
  }
}

async function loadExtras(bookingId: string): Promise<ExtraLine[]> {
  const { rows } = await bookingDb().query<{ name: string; price_cents: number }>(
    `select e.name, be.price_cents
       from public.booking_extras be
       join public.extras e on e.id = be.extra_id
      where be.booking_id = $1::uuid
      order by e.code`,
    [bookingId],
  );
  return rows.map((r) => ({ label: r.name, cents: r.price_cents }));
}

function siteUrl(): string {
  return (
    import.meta.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    'http://localhost:4321'
  ).replace(/\/$/, '');
}

function adminUrl(reference: string): string {
  const base = (
    import.meta.env.PUBLIC_ADMIN_URL ||
    process.env.PUBLIC_ADMIN_URL ||
    'http://localhost:4322'
  ).replace(/\/$/, '');
  return `${base}/bookings/${reference}`;
}

async function company() {
  await loadUiStrings();
  const s = await getSiteSettings();
  return {
    companyName: s.companyName,
    companyPhone: s.phone,
    companyEmail: s.email,
    officeTo: s.bookingNotificationEmail,
  };
}

export async function sendConfirmationEmails(
  reference: string,
  cancelToken: string,
  opts: {
    notifyOffice?: boolean;
    siblingTokens?: { reference: string; token: string }[];
  } = {},
): Promise<void> {
  const notifyOffice = opts.notifyOffice !== false;
  const booking = await loadBooking(reference);
  if (!booking) return;
  const extras = await loadExtras(booking.id);
  const settings = await getSettings();
  const co = await company();
  const pickupAtLocal = pickupLocalAthens(booking.pickup_at);
  const routeOrHours =
    booking.booking_type === 'transfer'
      ? `${booking.from_zone} → ${booking.to_zone}`
      : String(booking.hours ?? '');
  // Confirmation links to the manage page (same token; cancel stays at /booking/cancel/<token>).
  const cancelUrl = `${siteUrl()}/booking/manage/${cancelToken}`;
  const breakdownLines = Array.isArray(booking.price_breakdown)
    ? booking.price_breakdown
        .filter((l) => l && typeof l.amount === 'number')
        .map((l) => ({ label: l.label || l.code || 'Line', cents: l.amount as number }))
    : [];
  const hourlyKmIncluded =
    booking.booking_type === 'hourly' && booking.hours != null
      ? booking.hours * 40
      : null;

  let returnLeg: {
    reference: string;
    pickupAtLocal: string;
    routeOrHours: string;
    totalCents: number;
    cancelUrl: string;
  } | null = null;
  let paymentTotalCents: number | null = null;
  try {
    const { rows: sib } = await bookingDb().query<{
      reference: string;
      pickup_at: Date;
      from_zone: string;
      to_zone: string | null;
      price_cents: number;
      booking_type: 'transfer' | 'hourly';
      hours: number | null;
    }>(
      `select b.reference, b.pickup_at, b.price_cents, b.booking_type, b.hours,
              zf.name as from_zone, zt.name as to_zone
         from public.bookings b
         join public.bookings mine on mine.reference = $1
         join public.zones zf on zf.id = b.from_zone_id
         left join public.zones zt on zt.id = b.to_zone_id
        where mine.trip_group_id is not null
          and b.trip_group_id = mine.trip_group_id
          and b.id <> mine.id
        limit 1`,
      [reference],
    );
    const other = sib[0];
    const tok = opts.siblingTokens?.find((s) => s.reference === other?.reference);
    if (other && tok) {
      returnLeg = {
        reference: other.reference,
        pickupAtLocal: pickupLocalAthens(other.pickup_at),
        routeOrHours:
          other.booking_type === 'transfer'
            ? `${other.from_zone} → ${other.to_zone}`
            : String(other.hours ?? ''),
        totalCents: other.price_cents,
        cancelUrl: `${siteUrl()}/booking/manage/${tok.token}`,
      };
      paymentTotalCents = booking.price_cents + other.price_cents;
    }
  } catch {
    /* trip_group column missing — single-leg email */
  }

  const base = {
    reference: booking.reference,
    bookingType: booking.booking_type,
    pickupAtLocal,
    routeOrHours,
    className: booking.class_name,
    passengers: booking.passengers,
    extras,
    lines: [
      { label: booking.class_name, cents: booking.base_price_cents },
      ...extras,
    ],
    breakdownLines: breakdownLines.length ? [...breakdownLines, ...extras] : undefined,
    distanceKm: booking.distance_km,
    durationMin: booking.duration_min,
    hourlyKmIncluded,
    totalCents: booking.price_cents,
    vatRateBp: booking.vat_rate_bp,
    vatCents: booking.vat_cents,
    vipSecurity: booking.vip_security,
    invoiceRequested: booking.invoice_status === 'requested',
    cancelUrl,
    cancelWindowHours: settings.cancelWindowHours,
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
    returnLeg,
    paymentTotalCents,
    guestName: booking.guest_name,
    accountCompanyName: booking.account_company_name,
    paymentMethod: booking.payment_method,
  };

  const customer = confirmationEmail(base);
  await sendEmail({
    to: booking.customer_email,
    subject: customer.subject,
    html: customer.html,
    text: customer.text,
    tag: 'confirmation',
    reference,
  });

  if (!notifyOffice) return;

  const office = officeNewEmail({
    ...base,
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerPhone: booking.customer_phone,
    notes: booking.notes,
    flightNumber: booking.flight_number,
    invoiceCompany: booking.invoice_company,
    invoiceVat: booking.invoice_vat,
    invoiceTaxOffice: booking.invoice_tax_office,
    invoiceAddress: booking.invoice_address,
    adminUrl: adminUrl(reference),
    vehicleLabel: booking.vehicle_label,
    vehicleAutoAssigned: booking.vehicle_auto_assigned,
    pickupAddress: booking.pickup_address,
    dropoffAddress: booking.dropoff_address,
    pickupPlaceId: booking.pickup_place_id,
    pickupLat: booking.pickup_lat,
    pickupLng: booking.pickup_lng,
    dropoffPlaceId: booking.dropoff_place_id,
    dropoffLat: booking.dropoff_lat,
    dropoffLng: booking.dropoff_lng,
  });
  await sendEmail({
    to: co.officeTo,
    subject: office.subject,
    html: office.html,
    text: office.text,
    tag: 'office_new',
    reference,
  });
}

export async function sendManageLinkEmail(input: {
  to: string;
  reference: string;
  manageUrl: string;
}): Promise<void> {
  const co = await company();
  const parts = manageLinkEmail({
    reference: input.reference,
    manageUrl: input.manageUrl,
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
  });
  await sendEmail({
    to: input.to,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: 'manage_link',
    // No reference in logs beyond the tag path used by sendEmail failures —
    // omit reference so AC-35 log greps stay clean on the happy path.
  });
}

export async function sendPaymentLinkEmail(
  reference: string,
  checkoutUrl: string,
  holdEndsIso: string,
): Promise<void> {
  const booking = await loadBooking(reference);
  if (!booking) return;
  const co = await company();
  const parts = paymentLinkEmail({
    reference,
    pickupAtLocal: pickupLocalAthens(booking.pickup_at),
    holdEndsLocal: holdEndsIso,
    checkoutUrl,
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
  });
  await sendEmail({
    to: booking.customer_email,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: 'payment_link',
    reference,
  });
}

export async function sendCancellationEmails(reference: string, refundCents = 0): Promise<void> {
  const booking = await loadBooking(reference);
  if (!booking) return;
  const co = await company();
  const input = {
    reference,
    refundCents,
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
  };
  const customer = cancelledCustomerEmail(input);
  await sendEmail({
    to: booking.customer_email,
    subject: customer.subject,
    html: customer.html,
    text: customer.text,
    tag: 'cancelled_customer',
    reference,
  });
  const office = cancelledOfficeEmail(input);
  await sendEmail({
    to: co.officeTo,
    subject: office.subject,
    html: office.html,
    text: office.text,
    tag: 'cancelled_office',
    reference,
  });
}

export async function sendLateRefundEmails(reference: string): Promise<void> {
  const booking = await loadBooking(reference);
  if (!booking) return;
  const co = await company();
  const parts = lateRefundEmail({
    reference,
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
  });
  await sendEmail({
    to: booking.customer_email,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: 'late_refund_customer',
    reference,
  });
  await sendEmail({
    to: co.officeTo,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: 'late_refund_office',
    reference,
  });
}

export async function sendReminderForRow(row: {
  reference: string;
  customer_email: string;
  pickup_at: Date;
}): Promise<void> {
  const co = await company();
  const parts = reminderEmail({
    reference: row.reference,
    pickupAtLocal: pickupLocalAthens(row.pickup_at),
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
  });
  await sendEmail({
    to: row.customer_email,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: 'reminder',
    reference: row.reference,
  });
}

/** Claim reminder window bookings and send. Returns claimed references. */
export async function runReminderCron(): Promise<string[]> {
  const { rows } = await bookingDb().query<{
    reference: string;
    customer_email: string;
    pickup_at: Date;
  }>(
    `update public.bookings
        set reminder_sent_at = now()
      where status in ('confirmed', 'assigned')
        and reminder_sent_at is null
        and pickup_at between now() + interval '23 hours' and now() + interval '25 hours'
      returning reference, customer_email, pickup_at`,
  );
  for (const row of rows) {
    await sendReminderForRow(row);
  }
  return rows.map((r) => r.reference);
}
