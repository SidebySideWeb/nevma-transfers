import { Temporal } from '@js-temporal/polyfill';
import { ATHENS } from './time';

/** Athens calendar day key + long label for booking list grouping. */
export function athensDay(instant: Date | string): { key: string; label: string } {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const zdt = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(ATHENS);
  const key = `${zdt.year}-${String(zdt.month).padStart(2, '0')}-${String(zdt.day).padStart(2, '0')}`;
  const weekday = zdt.toLocaleString('en-GB', { weekday: 'long' });
  const month = zdt.toLocaleString('en-GB', { month: 'long' });
  return { key, label: `${weekday} ${zdt.day} ${month}` };
}

export function athensTime(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const zdt = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(ATHENS);
  return `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`;
}
