import 'server-only';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';

/** Limits from docs/BOOKING-RULES.md §11. */
export const RATE = {
  quotePerIp: { windowSeconds: 60, max: 30 },
  holdPerIp: { windowSeconds: 3600, max: 6 },
  holdPerVisitor: { windowSeconds: 3600, max: 6 },
  bookingPerIp: { windowSeconds: 3600, max: 6 },
  bookingPerVisitor: { windowSeconds: 3600, max: 6 },
} as const;

export async function assertRateLimit(key: string, windowSeconds: number, max: number): Promise<void> {
  const { rows } = await bookingDb().query<{ ok: boolean }>(
    `select public.hit_rate_limit($1::text, $2::int, $3::int) as ok`,
    [key, windowSeconds, max],
  );
  if (!rows[0]?.ok) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'rate_limit',
    });
  }
}
