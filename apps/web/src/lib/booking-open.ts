/** Feature flag until the Viva live account is approved (AC / prompt 13). */
export function isBookingOpen(): boolean {
  const flag =
    (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_BOOKING_OPEN) ||
    process.env.PUBLIC_BOOKING_OPEN;
  return flag === 'true';
}
