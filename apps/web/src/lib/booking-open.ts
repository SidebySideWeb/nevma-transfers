/**
 * Server-only feature flag until the Viva live account is approved.
 * Set BOOKING_OPEN=true in Vercel (no PUBLIC_ prefix) so Production can toggle
 * without rebuilding the static client bundle. /book is SSR and reads this at request time.
 */
export function isBookingOpen(): boolean {
  const flag =
    (typeof process !== 'undefined' && process.env.BOOKING_OPEN) ||
    (typeof import.meta !== 'undefined' &&
      (import.meta.env as { BOOKING_OPEN?: string }).BOOKING_OPEN);
  return flag === 'true';
}
