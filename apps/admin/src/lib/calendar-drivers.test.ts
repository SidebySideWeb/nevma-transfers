import { describe, expect, it } from 'vitest';
import { buildDriverDayTracks } from './calendar-drivers';
import { dayGrid, HOUR_PX } from './calendar-position';

describe('calendar driver rows', () => {
  it('25 Oct 2026 (25-hour day): driver bars and shift line use elapsed hours', () => {
    const grid = dayGrid('2026-10-25');
    expect(grid.hours).toBe(25);

    // After clocks go back: 04:00 EET = 02:00Z = 5 elapsed hours from midnight.
    const bookingStart = Date.parse('2026-10-25T02:00:00Z');
    const bookingEnd = Date.parse('2026-10-25T03:00:00Z');
    const shiftStart = Date.parse('2026-10-24T21:00:00Z'); // 00:00 EEST before the change
    const shiftEnd = Date.parse('2026-10-25T10:00:00Z'); // 12:00 EET

    const tracks = buildDriverDayTracks(
      grid,
      [{ id: 'd1', fullName: 'Alex Driver' }],
      [
        {
          reference: 'ELP-DRV001',
          driverId: 'd1',
          startMs: bookingStart,
          endMs: bookingEnd,
          rangeStartMs: bookingStart - 30 * 60_000,
          rangeEndMs: bookingEnd + 30 * 60_000,
          status: 'assigned',
          bookingType: 'transfer',
          vip: false,
          source: 'office',
        },
        {
          reference: 'ELP-NEED01',
          driverId: null,
          startMs: Date.parse('2026-10-25T08:00:00Z'), // 10:00 EET = 11 elapsed hours
          endMs: Date.parse('2026-10-25T09:00:00Z'),
          rangeStartMs: Date.parse('2026-10-25T08:00:00Z'),
          rangeEndMs: Date.parse('2026-10-25T09:00:00Z'),
          status: 'confirmed',
          bookingType: 'transfer',
          vip: false,
          source: null,
        },
      ],
      [{ driverId: 'd1', startMs: shiftStart, endMs: shiftEnd }],
    );

    expect(tracks).toHaveLength(2);
    const alex = tracks[0]!;
    expect(alex.label).toBe('Alex Driver');
    expect(alex.bars).toHaveLength(1);
    expect(alex.bars[0]!.left).toBe(5 * HOUR_PX);
    expect(alex.bars[0]!.width).toBe(HOUR_PX);
    expect(alex.bars[0]!.href).toBe('/bookings/ELP-DRV001');
    expect(alex.shifts.length).toBe(1);
    expect(alex.shifts[0]!.left).toBe(0);

    const needs = tracks[1]!;
    expect(needs.label).toBe('Needs a driver');
    expect(needs.lane).toBe(true);
    expect(needs.bars[0]!.left).toBe(11 * HOUR_PX);
    expect(needs.bars[0]!.cls).toMatch(/unassigned/);
  });
});
