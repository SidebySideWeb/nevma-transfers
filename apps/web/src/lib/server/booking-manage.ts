import 'server-only';
import { formatEuro } from '../booking/pricing';
import { formatLocal } from '../booking/time';
import { hashCancelToken, loadSanityVehicleClasses } from './booking-service';
import { bookingDb } from './db';
import { getSettings } from './settings';
import { getSiteSettings } from '../sanity/content';
import { t } from '../strings';

export type ManagePageView =
  | { kind: 'invalid' }
  | {
      kind: 'ok';
      reference: string;
      status: 'confirmed' | 'assigned' | 'completed' | 'pending' | 'cancelled' | 'expired';
      statusLabel: string;
      pickupLabel: string;
      pickupAt: Date;
      durationMinutes: number;
      bookingType: 'transfer' | 'hourly';
      typeLabel: string;
      routeOrHours: string;
      pickupAddress: string;
      dropoffAddress: string | null;
      flightNumber: string | null;
      flightStatus: string | null;
      className: string;
      /** First Sanity photo of the class (display only), or null. */
      photoUrl: string | null;
      leadName: string;
      passengers: number;
      luggage: number;
      extras: { name: string; cents: number; label: string }[];
      priceCents: number;
      priceLabel: string;
      basePriceCents: number;
      vatRateBp: number;
      vatCents: number;
      netCents: number;
      analysisLines: { label: string; cents: number }[];
      canCancel: boolean;
      timeline: { key: string; title: string; current: boolean; done: boolean }[];
      officeEmail: string;
      officePhone: string;
      officePhoneHref: string;
      /** B6 return trip: other leg in the same trip group, if any. */
      sibling: {
        reference: string;
        status: string;
        pickupLabel: string;
        routeOrHours: string;
        priceLabel: string;
        leg: number | null;
      } | null;
      leg: number | null;
    };

const TIMELINE_KEYS = ['booked', 'confirmed', 'assigned', 'completed'] as const;

function timelineFor(status: string) {
  const currentIdx =
    status === 'completed'
      ? 3
      : status === 'assigned'
        ? 2
        : status === 'confirmed'
          ? 1
          : 0;
  return TIMELINE_KEYS.map((key, i) => ({
    key,
    title: t(`manage.timeline.${key}` as 'manage.timeline.booked'),
    current: i === currentIdx,
    done: i <= currentIdx,
  }));
}

export async function managePageView(token: string): Promise<ManagePageView> {
  if (!token || token.length < 16) return { kind: 'invalid' };
  const hash = hashCancelToken(token);
  const { rows } = await bookingDb().query<{
    reference: string;
    status: string;
    pickup_at: Date;
    duration_minutes: number;
    booking_type: 'transfer' | 'hourly';
    hours: number | null;
    pickup_address: string;
    dropoff_address: string | null;
    flight_number: string | null;
    flight_status: string | null;
    class_key: string;
    class_name: string;
    customer_name: string;
    passengers: number;
    luggage: number;
    price_cents: number;
    base_price_cents: number;
    vat_rate_bp: number;
    vat_cents: number;
    from_name: string | null;
    to_name: string | null;
    distance_km: number | null;
    duration_min: number | null;
    price_breakdown: { code?: string; label?: string; amount?: number }[] | null;
  }>(
    `select b.id, b.reference, b.status, b.pickup_at, b.duration_minutes, b.booking_type, b.hours,
            b.pickup_address, b.dropoff_address, b.flight_number, b.flight_status, c.key as class_key, c.name as class_name, b.customer_name,
            b.passengers, b.luggage, b.price_cents, b.base_price_cents, b.vat_rate_bp, b.vat_cents,
            zf.name as from_name, zt.name as to_name,
            b.distance_km, b.duration_min, b.price_breakdown, b.trip_group_id, b.leg
       from public.bookings b
       join public.vehicle_classes c on c.id = b.class_id
       left join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id
      where b.cancel_token_hash = $1`,
    [hash],
  );
  const b = rows[0] as (typeof rows)[0] & {
    id: string;
    trip_group_id?: string | null;
    leg?: number | null;
  };
  if (!b || b.status === 'cancelled' || b.status === 'expired') return { kind: 'invalid' };

  const { rows: extras } = await bookingDb().query<{ name: string; cents: number }>(
    `select e.name, be.price_cents as cents
       from public.booking_extras be
       join public.extras e on e.id = be.extra_id
       join public.bookings b on b.id = be.booking_id
      where b.cancel_token_hash = $1
      order by e.code`,
    [hash],
  );

  const settings = await getSettings();
  const site = await getSiteSettings();
  const photoUrl =
    (await loadSanityVehicleClasses()).find((c) => c.key === b.class_key)?.photos?.[0]?.url ?? null;
  const cutoff = new Date(b.pickup_at).getTime() - settings.cancelWindowHours * 3600_000;
  const canCancel =
    (b.status === 'confirmed' || b.status === 'assigned') && Date.now() <= cutoff;

  let sibling: {
    reference: string;
    status: string;
    pickupLabel: string;
    routeOrHours: string;
    priceLabel: string;
    leg: number | null;
  } | null = null;
  if (b.trip_group_id) {
    try {
      const { rows: sibRows } = await bookingDb().query<{
        reference: string;
        status: string;
        pickup_at: Date;
        booking_type: string;
        hours: number | null;
        duration_minutes: number;
        price_cents: number;
        from_name: string | null;
        to_name: string | null;
        leg: number | null;
      }>(
        `select b.reference, b.status, b.pickup_at, b.booking_type, b.hours, b.duration_minutes, b.price_cents, b.leg,
                zf.name as from_name, zt.name as to_name
           from public.bookings b
           left join public.zones zf on zf.id = b.from_zone_id
           left join public.zones zt on zt.id = b.to_zone_id
          where b.trip_group_id = $1::uuid and b.id <> $2::uuid
          limit 1`,
        [b.trip_group_id, b.id],
      );
      const s = sibRows[0];
      if (s) {
        sibling = {
          reference: s.reference,
          status: s.status,
          pickupLabel: `${formatLocal(new Date(s.pickup_at), settings.timezone)} (Athens)`,
          routeOrHours:
            s.booking_type === 'hourly'
              ? `${s.hours ?? Math.round(s.duration_minutes / 60)} h`
              : `${s.from_name ?? '—'} → ${s.to_name ?? '—'}`,
          priceLabel: formatEuro(s.price_cents),
          leg: s.leg,
        };
      }
    } catch {
      /* column missing */
    }
  }

  const statusKey = `manage.status.${b.status}` as 'manage.status.confirmed';
  const typeLabel =
    b.booking_type === 'hourly' ? t('booking.toggle.hourly') : t('booking.toggle.transfer');
  const distMeta =
    b.distance_km != null
      ? `${Number(b.distance_km).toFixed(1)} km${b.duration_min != null ? ` · approx. ${b.duration_min} min` : ''}`
      : null;
  const hourlyKm =
    b.booking_type === 'hourly' && b.hours != null ? `${b.hours * 40} km included` : null;
  const routeOrHours =
    b.booking_type === 'hourly'
      ? `${b.hours ?? Math.round(b.duration_minutes / 60)} h${hourlyKm ? ` · ${hourlyKm}` : ''}`
      : `${b.from_name ?? '—'} → ${b.to_name ?? '—'}${distMeta ? ` · ${distMeta}` : ''}`;

  return {
    kind: 'ok',
    reference: b.reference,
    status: b.status as
      | 'confirmed'
      | 'assigned'
      | 'completed'
      | 'pending'
      | 'cancelled'
      | 'expired',
    statusLabel: t(statusKey),
    pickupLabel: `${formatLocal(new Date(b.pickup_at), settings.timezone)} (Athens)`,
    pickupAt: new Date(b.pickup_at),
    durationMinutes: b.duration_minutes,
    bookingType: b.booking_type,
    typeLabel,
    routeOrHours,
    pickupAddress: b.pickup_address,
    dropoffAddress: b.dropoff_address,
    flightNumber: b.flight_number,
    flightStatus: b.flight_status,
    className: b.class_name,
    photoUrl,
    leadName: b.customer_name,
    passengers: b.passengers,
    luggage: b.luggage,
    extras: (extras ?? []).map((e) => ({
      ...e,
      label: `${e.name}: ${formatEuro(e.cents)}`,
    })),
    priceCents: b.price_cents,
    priceLabel: formatEuro(b.price_cents),
    basePriceCents: b.base_price_cents,
    vatRateBp: b.vat_rate_bp,
    vatCents: b.vat_cents,
    netCents: b.price_cents - b.vat_cents,
    analysisLines: (() => {
      const fromQuote = Array.isArray(b.price_breakdown)
        ? b.price_breakdown
            .filter((l) => l && typeof l.amount === 'number')
            .map((l) => ({ label: l.label || l.code || 'Line', cents: l.amount as number }))
        : [];
      if (fromQuote.length) {
        return [...fromQuote, ...(extras ?? []).map((e) => ({ label: e.name, cents: e.cents }))];
      }
      return [
        { label: b.class_name, cents: b.base_price_cents },
        ...(extras ?? []).map((e) => ({ label: e.name, cents: e.cents })),
      ];
    })(),
    canCancel,
    timeline: timelineFor(b.status),
    officeEmail: site.email,
    officePhone: site.phone,
    officePhoneHref: `tel:${site.phone.replace(/[^\d+]/g, '')}`,
    sibling,
    leg: b.leg ?? null,
  };
}

/** Escape text for iCalendar (RFC 5545). */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function icsUtcStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

export function buildCalendarIcs(opts: {
  reference: string;
  siteHost: string;
  pickupAt: Date;
  durationMinutes: number;
  pickupAddress: string;
  officePhone: string;
  summary: string;
  now?: Date;
}): string {
  const dtstamp = icsUtcStamp(opts.now ?? new Date());
  const dtstart = icsUtcStamp(opts.pickupAt);
  const duration = `PT${Math.max(1, Math.round(opts.durationMinutes))}M`;
  const uid = `${opts.reference}@${opts.siteHost}`;
  const description = icsEscape(`Elite Protection · ${opts.officePhone}`);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elite Protection//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DURATION:${duration}`,
    `SUMMARY:${icsEscape(opts.summary)}`,
    `LOCATION:${icsEscape(opts.pickupAddress)}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
