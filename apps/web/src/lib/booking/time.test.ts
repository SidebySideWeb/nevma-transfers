import { describe, expect, it } from 'vitest';
import { BookingError } from './types';
import { assertLeadTime, formatLocal, localToInstant, toIsoWithOffset } from './time';

describe('AC-14 time zone conversion', () => {
  it('AC-14: rejects a non-existent spring-forward local time', () => {
    expect(() => localToInstant('2027-03-28T03:30', 'Europe/Athens')).toThrow(BookingError);
    try {
      localToInstant('2027-03-28T03:30', 'Europe/Athens');
    } catch (err) {
      expect(err).toBeInstanceOf(BookingError);
      expect((err as BookingError).code).toBe('invalid_request');
      expect((err as BookingError).field).toBe('pickupLocal');
    }
  });

  it('AC-14: repeated autumn time uses the earlier (+03:00) occurrence', () => {
    const instant = localToInstant('2026-10-25T03:30', 'Europe/Athens');
    expect(instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('AC-14: winter local time converts with +02:00 offset', () => {
    const instant = localToInstant('2026-12-01T10:00', 'Europe/Athens');
    expect(instant.toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });
});

describe('AC-15 lead time', () => {
  it('AC-15: pickup 119 minutes from now with lead 120 throws error.lead_time', () => {
    const now = new Date('2026-12-01T10:00:00.000Z');
    const pickup = new Date(now.getTime() + 119 * 60_000);
    expect(() => assertLeadTime(pickup, now, 120)).toThrow(BookingError);
    try {
      assertLeadTime(pickup, now, 120);
    } catch (err) {
      expect((err as BookingError).code).toBe('invalid_request');
      expect((err as BookingError).stringKey).toBe('error.lead_time');
      expect((err as BookingError).vars).toEqual({ hours: 2 });
    }
  });

  it('AC-15: pickup 121 minutes from now with lead 120 passes', () => {
    const now = new Date('2026-12-01T10:00:00.000Z');
    const pickup = new Date(now.getTime() + 121 * 60_000);
    expect(() => assertLeadTime(pickup, now, 120)).not.toThrow();
  });

  it('AC-15: a past pickup time throws', () => {
    const now = new Date('2026-12-01T10:00:00.000Z');
    const pickup = new Date(now.getTime() - 60_000);
    expect(() => assertLeadTime(pickup, now, 120)).toThrow(BookingError);
  });
});

describe('format helpers', () => {
  it('formats local display and ISO with offset', () => {
    const instant = localToInstant('2026-12-01T10:00', 'Europe/Athens');
    expect(formatLocal(instant, 'Europe/Athens')).toBe('Tue 1 Dec 2026, 10:00');
    expect(toIsoWithOffset(instant, 'Europe/Athens')).toBe('2026-12-01T10:00:00+02:00');
  });
});
