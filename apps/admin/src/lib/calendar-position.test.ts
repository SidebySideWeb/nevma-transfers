import { describe, expect, it } from 'vitest';
import {
  athensDateKey,
  athensLocalMs,
  barPosition,
  dayGrid,
  hourLabel,
  minutesSinceMidnight,
  packLanes,
  weekDays,
} from './calendar-position';

const at = (iso: string) => new Date(iso);

describe('calendar position (Europe/Athens)', () => {
  it('a normal day has 24 hours', () => {
    const g = dayGrid('2026-12-01');
    expect(g.hours).toBe(24);
    expect(g.minutes).toBe(1440);
  });

  it('25 Oct 2026 is a 25-hour day: 04:00 local is five elapsed hours after midnight', () => {
    const g = dayGrid('2026-10-25');
    expect(g.hours).toBe(25);
    expect(g.minutes).toBe(1500);
    expect(g.hourStarts).toHaveLength(25);
    // 04:00 EET (UTC+2) after the clocks went back = 02:00Z
    const p = barPosition(g, at('2026-10-25T02:00:00Z'), at('2026-10-25T03:00:00Z'))!;
    expect(p.left).toBe(5 * 56);
    expect(p.width).toBe(56);
    // the repeated 03:00 hour is labelled
    expect([hourLabel(g, 3), hourLabel(g, 4)]).toEqual(['03:00', '03:00²']);
    // the day still ends at local midnight
    expect(minutesSinceMidnight(g, at('2026-10-25T22:00:00Z'))).toBe(1500);
  });

  it('29 Mar 2026 is a 23-hour day: 04:00 local is three elapsed hours after midnight', () => {
    const g = dayGrid('2026-03-29');
    expect(g.hours).toBe(23);
    expect(g.minutes).toBe(1380);
    // 04:00 EEST (UTC+3) = 01:00Z
    const p = barPosition(g, at('2026-03-29T01:00:00Z'), at('2026-03-29T02:30:00Z'))!;
    expect(p.left).toBe(3 * 56);
    expect(p.width).toBe(84);
    expect(hourLabel(g, 2)).toBe('02:00');
    expect(hourLabel(g, 3)).toBe('04:00');
  });

  it('clips a bar that crosses midnight and ignores one outside the day', () => {
    const g = dayGrid('2026-12-01');
    const late = barPosition(g, at('2026-12-01T21:15:00Z'), at('2026-12-01T23:00:00Z'))!; // 23:15 → 01:00
    expect(late.left).toBeCloseTo((23.25) * 56);
    expect(late.left + late.width).toBeCloseTo(24 * 56);
    expect(barPosition(g, at('2026-11-30T10:00:00Z'), at('2026-11-30T11:00:00Z'))).toBeNull();
    expect(barPosition(g, at('2026-12-01T22:00:00Z'), at('2026-12-01T23:00:00Z'))).toBeNull();
  });

  it('06:00 local sits 7 elapsed hours in on 25 Oct and 5 on 29 Mar', () => {
    const at6 = (k: string) => {
      const g = dayGrid(k);
      return minutesSinceMidnight(g, new Date(athensLocalMs(k, '06:00'))) / 60;
    };
    expect(at6('2026-10-25')).toBe(7);
    expect(at6('2026-03-29')).toBe(5);
    expect(at6('2026-12-01')).toBe(6);
  });

  it('week days start on Monday; date key follows Athens, not UTC', () => {
    expect(weekDays('2026-12-01')[0]).toBe('2026-11-30');
    expect(weekDays('2026-12-06')[6]).toBe('2026-12-06');
    expect(athensDateKey(at('2026-12-01T22:30:00Z'))).toBe('2026-12-02');
  });

  it('packs overlapping bars into separate lanes', () => {
    const lanes = packLanes([
      { id: 'a', startMs: 0, endMs: 10 },
      { id: 'b', startMs: 5, endMs: 15 },
      { id: 'c', startMs: 10, endMs: 20 },
    ]);
    expect(lanes.map((l) => l.map((i) => i.id))).toEqual([['a', 'c'], ['b']]);
  });
});
