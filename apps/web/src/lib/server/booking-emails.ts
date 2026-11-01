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
  price_cents: number;
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

async function loadBooking(reference: string): Promise<BookingRow | null> {
  const { rows } = await bookingDb().query<BookingRow>(
    `select b.id, b.reference, b.booking_type, b.pickup_at, b.hours, b.passengers, b.price_cents,
            b.vip_security, b.invoice_status, b.customer_name, b.customer_email, b.customer_phone,
            b.notes, b.flight_number, b.invoice_company, b.invoice_vat, b.invoice_tax_office,
            b.invoice_address, c.name as class_name, zf.name as from_zone, zt.name as to_zone
       from public.bookings b
       join public.vehicle_classes c on c.id = b.class_id
       join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id
      where b.reference = $1`,
    [reference],
  );
  return rows[0] ?? null;
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
  opts: { notifyOffice?: boolean } = {},
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
  const cancelUrl = `${siteUrl()}/booking/cancel/${cancelToken}`;
  const base = {
    reference: booking.reference,
    bookingType: booking.booking_type,
    pickupAtLocal,
    routeOrHours,
    className: booking.class_name,
    passengers: booking.passengers,
    extras,
    totalCents: booking.price_cents,
    vipSecurity: booking.vip_security,
    invoiceRequested: booking.invoice_status === 'requested',
    cancelUrl,
    cancelWindowHours: settings.cancelWindowHours,
    companyName: co.companyName,
    companyPhone: co.companyPhone,
    companyEmail: co.companyEmail,
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
