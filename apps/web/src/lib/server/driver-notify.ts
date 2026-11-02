import 'server-only';
import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { getSiteSettings, loadUiStrings } from '../sanity/content';
import { bookingDb } from './db';
import { sendEmail } from './email';
import { driverAssignmentEmail } from './email-templates';

const NotifyBody = z
  .object({
    reference: z.string().min(1),
    kind: z.enum(['assigned', 'changed', 'removed']),
  })
  .strict();

const FOURTEEN_DAYS_MS = 14 * 24 * 3600_000;

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

export type NotifyResult = { status: 'sent' | 'skipped'; reason?: string };

/** E-mail the assigned driver. Skips without login or when pick-up is more than 14 days away. No prices. */
export async function internalDriverNotify(raw: unknown): Promise<NotifyResult> {
  const parsed = NotifyBody.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const { reference, kind } = parsed.data;

  const { rows } = await bookingDb().query<{
    reference: string;
    booking_type: 'transfer' | 'hourly';
    pickup_at: Date;
    hours: number | null;
    passengers: number;
    pickup_address: string;
    from_zone: string;
    to_zone: string | null;
    driver_email: string | null;
    driver_user_id: string | null;
    driver_name: string | null;
  }>(
    `select b.reference, b.booking_type, b.pickup_at, b.hours, b.passengers, b.pickup_address,
            zf.name as from_zone, zt.name as to_zone,
            d.email as driver_email, d.user_id::text as driver_user_id, d.full_name as driver_name
       from public.bookings b
       join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id
       left join public.drivers d on d.id = b.driver_id
      where b.reference = $1`,
    [reference],
  );
  const row = rows[0];
  if (!row) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_booking',
    });
  }

  if (kind === 'removed') {
    // Removal: driver_id is already null; look up last removed event's driver.
    const { rows: ev } = await bookingDb().query<{
      email: string;
      user_id: string | null;
      full_name: string;
    }>(
      `select d.email, d.user_id::text, d.full_name
         from public.booking_events e
         join public.drivers d on d.id = e.driver_id
        where e.booking_id = (select id from public.bookings where reference = $1)
          and e.kind = 'driver_removed'
        order by e.at desc
        limit 1`,
      [reference],
    );
    if (!ev[0]?.user_id || !ev[0].email) {
      return { status: 'skipped', reason: 'no_login' };
    }
    row.driver_email = ev[0].email;
    row.driver_user_id = ev[0].user_id;
    row.driver_name = ev[0].full_name;
  }

  if (!row.driver_user_id || !row.driver_email) {
    return { status: 'skipped', reason: 'no_login' };
  }

  const pickupMs = new Date(row.pickup_at).getTime();
  if (pickupMs - Date.now() > FOURTEEN_DAYS_MS) {
    return { status: 'skipped', reason: 'too_far' };
  }

  await loadUiStrings();
  const site = await getSiteSettings();
  const routeOrHours =
    row.booking_type === 'transfer'
      ? `${row.from_zone} → ${row.to_zone ?? ''}`
      : `${row.hours ?? ''} hours`;
  const parts = driverAssignmentEmail({
    kind,
    reference: row.reference,
    pickupAtLocal: pickupLocalAthens(row.pickup_at),
    routeOrHours,
    pickupAddress: row.pickup_address,
    passengers: row.passengers,
    driverName: row.driver_name ?? '',
    companyName: site.companyName,
    companyPhone: site.phone,
    companyEmail: site.email,
  });

  // Guard: never put money into the driver mail.
  const blob = `${parts.subject}\n${parts.text}\n${parts.html}`;
  if (/€|EUR|\bprice\b|\bcents?\b|\bvat\b/i.test(blob)) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'price_leak',
    });
  }

  await sendEmail({
    to: row.driver_email,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: `driver_${kind}`,
    reference: row.reference,
  });
  return { status: 'sent' };
}
