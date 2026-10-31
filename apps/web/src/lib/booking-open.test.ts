import { describe, expect, it } from 'vitest';
import { isBookingOpen } from './booking-open';

describe('isBookingOpen', () => {
  it('is false unless PUBLIC_BOOKING_OPEN is the string true', () => {
    const prev = process.env.PUBLIC_BOOKING_OPEN;
    try {
      process.env.PUBLIC_BOOKING_OPEN = 'false';
      expect(isBookingOpen()).toBe(false);
      process.env.PUBLIC_BOOKING_OPEN = 'true';
      expect(isBookingOpen()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_BOOKING_OPEN;
      else process.env.PUBLIC_BOOKING_OPEN = prev;
    }
  });
});
