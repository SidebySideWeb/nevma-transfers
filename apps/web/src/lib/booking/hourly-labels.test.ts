import { describe, expect, it } from 'vitest';
import {
  earliestPickupLocal,
  hourlyDurationLabel,
  isAirportZone,
  meetsMinNotice,
  normaliseFlightNumber,
} from './hourly-labels';

describe('hourlyDurationLabel', () => {
  it('uses km_per_hour for included km', () => {
    expect(hourlyDurationLabel(2, 40)).toBe('2 hours (80 km included)');
    expect(hourlyDurationLabel(4, 40)).toBe('4 hours (160 km included)');
    expect(hourlyDurationLabel(1, 40)).toBe('1 hour (40 km included)');
  });
});

describe('min notice', () => {
  it('rounds up to 5-minute steps after lead', () => {
    // 2026-11-07T10:01:00Z → Athens 12:01 + 180 min lead = 15:01 → round to 15:05
    const now = new Date('2026-11-07T10:01:00.000Z');
    const earliest = earliestPickupLocal(now, 180, 'Europe/Athens');
    expect(earliest).toMatch(/T\d{2}:\d{2}$/);
    const minute = Number(earliest.slice(-2));
    expect(minute % 5).toBe(0);
    expect(meetsMinNotice(earliest, earliest)).toBe(true);
    expect(meetsMinNotice('2020-01-01T00:00', earliest)).toBe(false);
  });
});

describe('flight + airport', () => {
  it('upper-cases flight numbers and keeps spaces', () => {
    expect(normaliseFlightNumber('a3 603')).toBe('A3 603');
    expect(normaliseFlightNumber('lh1284!')).toBe('LH1284');
  });

  it('detects airport zones', () => {
    expect(isAirportZone({ code: 'demo-airport', name: 'DEMO Airport' })).toBe(true);
    expect(isAirportZone({ code: 'demo-centre', name: 'Centre' })).toBe(false);
  });
});
