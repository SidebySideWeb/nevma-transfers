import { describe, expect, it } from 'vitest';
import { isBookingOpen } from './booking-open';

describe('isBookingOpen', () => {
  it('is false unless BOOKING_OPEN is the string true', () => {
    const prev = process.env.BOOKING_OPEN;
    try {
      process.env.BOOKING_OPEN = 'false';
      expect(isBookingOpen()).toBe(false);
      process.env.BOOKING_OPEN = 'true';
      expect(isBookingOpen()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.BOOKING_OPEN;
      else process.env.BOOKING_OPEN = prev;
    }
  });
});
