import { Temporal } from '@js-temporal/polyfill';
import { BookingError } from './types';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Possible Instants for a local PlainDateTime in a time zone.
 * Polyfill no longer exposes Temporal.TimeZone; this mirrors getPossibleInstantsFor.
 */
function getPossibleInstantsFor(
  plain: Temporal.PlainDateTime,
  timeZone: string,
): Temporal.Instant[] {
  const earlier = plain.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  const later = plain.toZonedDateTime(timeZone, { disambiguation: 'later' });
  const earlierMatches = Temporal.PlainDateTime.compare(earlier.toPlainDateTime(), plain) === 0;
  const laterMatches = Temporal.PlainDateTime.compare(later.toPlainDateTime(), plain) === 0;

  // Spring gap: wall time does not exist.
  if (!earlierMatches && !laterMatches) return [];

  if (earlier.epochNanoseconds === later.epochNanoseconds) {
    return [earlier.toInstant()];
  }

  const out: Temporal.Instant[] = [];
  if (earlierMatches) out.push(earlier.toInstant());
  if (laterMatches) out.push(later.toInstant());
  return out;
}

/**
 * Convert a local wall time (no offset) to an Instant.
 * Uses getPossibleInstantsFor: none → invalid; one or two → the earlier (first).
 */
export function localToInstant(local: string, timeZone: string): Date {
  const match = LOCAL_RE.exec(local);
  if (!match) {
    throw new BookingError('invalid_request', {
      field: 'pickupLocal',
      stringKey: 'error.invalid_request',
      message: 'pickupLocal must be YYYY-MM-DDTHH:mm',
    });
  }

  const [, ys, ms, ds, hs, mins] = match;
  const plain = Temporal.PlainDateTime.from({
    year: Number(ys),
    month: Number(ms),
    day: Number(ds),
    hour: Number(hs),
    minute: Number(mins),
  });

  const possible = getPossibleInstantsFor(plain, timeZone);
  if (possible.length === 0) {
    throw new BookingError('invalid_request', {
      field: 'pickupLocal',
      stringKey: 'error.invalid_request',
      message: 'pickupLocal does not exist in this time zone',
    });
  }

  const instant = possible[0]!;
  return new Date(Number(instant.epochMilliseconds));
}

export function formatLocal(instant: Date, timeZone: string): string {
  const zdt = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  const weekday = zdt.toLocaleString('en-GB', { weekday: 'short' });
  const day = zdt.day;
  const month = zdt.toLocaleString('en-GB', { month: 'short' });
  const year = zdt.year;
  const hour = String(zdt.hour).padStart(2, '0');
  const minute = String(zdt.minute).padStart(2, '0');
  return `${weekday} ${day} ${month} ${year}, ${hour}:${minute}`;
}

export function toIsoWithOffset(instant: Date, timeZone: string): string {
  const zdt = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  // Drop the [Europe/Athens] suffix; keep offset.
  return zdt.toString({ timeZoneName: 'never', smallestUnit: 'second' });
}

export function assertLeadTime(pickup: Date, now: Date, minLeadMinutes: number): void {
  const earliest = new Date(now.getTime() + minLeadMinutes * 60_000);
  if (pickup.getTime() < earliest.getTime()) {
    const hours = Math.ceil(minLeadMinutes / 60);
    throw new BookingError('invalid_request', {
      stringKey: 'error.lead_time',
      vars: { hours },
      message: 'pickup is too soon',
    });
  }
}
