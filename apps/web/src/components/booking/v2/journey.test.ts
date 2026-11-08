import { describe, expect, it } from 'vitest';
import { isPickupLocal, joinLocal, routeLines } from './journey';
import type { BookingStrings, OptionsData } from '../types';

const strings = {
  'booking.cancel.hours': '{hours} hours',
  'booking.toggle.hourly': 'By the hour',
} as BookingStrings;

const options = {
  zones: [
    { code: 'aia', name: 'Athens Airport' },
    { code: 'centre', name: 'Athens centre' },
  ],
} as OptionsData;

describe('routeLines', () => {
  it('prefers Google / typed addresses over zone codes', () => {
    const r = routeLines(
      strings,
      options,
      { type: 'transfer', fromZone: 'aia', toZone: 'centre', hours: 3 },
      {
        pickupAddress: 'Hilton Garden Inn Athens',
        dropoffAddress: 'Sounio Poseidon Villa',
      },
    );
    expect(r.from).toBe('Hilton Garden Inn Athens');
    expect(r.to).toBe('Sounio Poseidon Villa');
    expect(r.text).toContain('Hilton');
    expect(r.text).toContain('Sounio');
  });

  it('falls back to zone names when addresses are empty', () => {
    const r = routeLines(strings, options, {
      type: 'transfer',
      fromZone: 'aia',
      toZone: 'centre',
      hours: 3,
    });
    expect(r.from).toBe('Athens Airport');
    expect(r.to).toBe('Athens centre');
  });
});

describe('joinLocal / isPickupLocal', () => {
  it('joins date and time as YYYY-MM-DDTHH:mm', () => {
    expect(joinLocal('2026-11-05', '10:00')).toBe('2026-11-05T10:00');
    expect(isPickupLocal('2026-11-05T10:00')).toBe(true);
  });

  it('strips seconds from browser time values', () => {
    expect(joinLocal('2026-11-05', '10:00:00')).toBe('2026-11-05T10:00');
  });

  it('rejects empty or partial pickupLocal', () => {
    expect(isPickupLocal('')).toBe(false);
    expect(isPickupLocal('2026-11-05T')).toBe(false);
    expect(isPickupLocal('T10:00')).toBe(false);
    expect(isPickupLocal('2026-11-05T10:00:00')).toBe(false);
  });
});
