import type { BookingStrings, OptionsData, SearchState } from '../types';

/** `YYYY-MM-DDTHH:mm` (Athens wall time, as the API wants it) <-> the design's separate date and time inputs. */
export function splitLocal(pickupLocal: string): { date: string; time: string } {
  const [date = '', time = ''] = pickupLocal.split('T');
  return { date, time: time.slice(0, 5) };
}

export function joinLocal(date: string, time: string): string {
  // Browsers sometimes emit HH:mm:ss; the quote API only accepts HH:mm.
  const t = time.slice(0, 5);
  return date || t ? `${date}T${t}` : '';
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/;

/** True when `pickupLocal` is exactly `YYYY-MM-DDTHH:mm` (API shape). */
export function isPickupLocal(pickupLocal: string): boolean {
  return LOCAL_RE.test(pickupLocal);
}

/** "Tue 17 Nov 2026" and "14:30". The value is a wall time: no zone conversion, so no date library. */
export function formatWhen(pickupLocal: string): { date: string; time: string } | null {
  const m = LOCAL_RE.exec(pickupLocal);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const part = (o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
  return {
    date: `${part({ weekday: 'short' })} ${Number(m[3])} ${part({ month: 'short' })} ${m[1]}`,
    time: m[4]!,
  };
}

export function fill(template: string | undefined, vars: Record<string, string | number>): string {
  return (template ?? '').replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));
}

export function zoneName(options: OptionsData, code: string): string {
  return options.zones.find((z) => z.code === code)?.name ?? code;
}

/** "{n} hours" (reuses the cancel page string). */
export function hoursText(strings: BookingStrings, hours: number): string {
  return fill(strings['booking.cancel.hours'], { hours });
}

/**
 * Route for the summary (`from`, then `to` or, for hourly hire, `second` = "By the hour · 4 hours")
 * and one-line `text` for the vehicle intro and the review row.
 */
export function routeLines(
  strings: BookingStrings,
  options: OptionsData,
  search: Pick<SearchState, 'type' | 'fromZone' | 'toZone' | 'hours'>,
): { from: string; to: string | null; second: string; text: string } {
  const from = zoneName(options, search.fromZone);
  if (search.type === 'transfer') {
    const to = zoneName(options, search.toZone);
    return { from, to, second: to, text: `${from} → ${to}` };
  }
  const hours = hoursText(strings, search.hours);
  return {
    from,
    to: null,
    second: `${strings['booking.toggle.hourly'] ?? ''} · ${hours}`,
    text: `${from} · ${hours}`,
  };
}

export function requestQuoteHref(search: SearchState, classKey?: string): string {
  const q = new URLSearchParams();
  if (search.fromZone) q.set('from', search.fromZone);
  if (search.type === 'transfer' && search.toZone) q.set('to', search.toZone);
  if (classKey) q.set('class', classKey);
  const qs = q.toString();
  return qs ? `/request-a-transfer?${qs}` : '/request-a-transfer';
}
