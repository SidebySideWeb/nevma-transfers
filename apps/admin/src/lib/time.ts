import { Temporal } from '@js-temporal/polyfill';

export const ATHENS = 'Europe/Athens';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function getPossibleInstantsFor(
  plain: Temporal.PlainDateTime,
  timeZone: string,
): Temporal.Instant[] {
  const earlier = plain.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  const later = plain.toZonedDateTime(timeZone, { disambiguation: 'later' });
  const earlierMatches = Temporal.PlainDateTime.compare(earlier.toPlainDateTime(), plain) === 0;
  const laterMatches = Temporal.PlainDateTime.compare(later.toPlainDateTime(), plain) === 0;
  if (!earlierMatches && !laterMatches) return [];
  if (earlier.epochNanoseconds === later.epochNanoseconds) {
    return [earlier.toInstant()];
  }
  const out: Temporal.Instant[] = [];
  if (earlierMatches) out.push(earlier.toInstant());
  if (laterMatches) out.push(later.toInstant());
  return out;
}

/** `YYYY-MM-DDTHH:mm` in Athens → UTC Date. Non-existent local times rejected. */
export function athensLocalToInstant(local: string): Date {
  const match = LOCAL_RE.exec(local);
  if (!match) throw new Error('invalid_local');
  const [, ys, ms, ds, hs, mins] = match;
  const plain = Temporal.PlainDateTime.from({
    year: Number(ys),
    month: Number(ms),
    day: Number(ds),
    hour: Number(hs),
    minute: Number(mins),
  });
  const possible = getPossibleInstantsFor(plain, ATHENS);
  if (possible.length === 0) throw new Error('invalid_local');
  return new Date(Number(possible[0]!.epochMilliseconds));
}

export function formatAthens(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const zdt = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(ATHENS);
  const weekday = zdt.toLocaleString('en-GB', { weekday: 'short' });
  const month = zdt.toLocaleString('en-GB', { month: 'short' });
  return `${weekday} ${zdt.day} ${month} ${zdt.year}, ${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`;
}

export function formatAthensShort(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const zdt = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(ATHENS);
  return `${zdt.day} ${zdt.toLocaleString('en-GB', { month: 'short' })} ${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`;
}

export function toAthensInputValue(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const zdt = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(ATHENS);
  return `${zdt.year}-${String(zdt.month).padStart(2, '0')}-${String(zdt.day).padStart(2, '0')}T${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`;
}
