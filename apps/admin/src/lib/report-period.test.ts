import { describe, expect, it } from 'vitest';
import {
  athensYesterdayKey,
  monthRangeContaining,
  resolvePeriod,
  threeMonthRangeEnding,
  weekRangeContaining,
} from './report-period';

describe('report periods', () => {
  it('uses Monday-start weeks', () => {
    // 2026-11-04 is Wednesday
    expect(weekRangeContaining('2026-11-04')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('resolves month and three months ending on the month of the anchor', () => {
    expect(monthRangeContaining('2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(threeMonthRangeEnding('2026-11-15')).toEqual({ from: '2026-09-01', to: '2026-11-30' });
  });

  it('presets end on Athens yesterday', () => {
    const now = new Date('2026-11-02T12:00:00+02:00');
    expect(athensYesterdayKey(now)).toBe('2026-11-01');
    const week = resolvePeriod('week', null, null, now);
    expect(week.to).toBe('2026-11-01');
    expect(week.from).toBe('2026-10-26'); // Monday of that week
  });
});
