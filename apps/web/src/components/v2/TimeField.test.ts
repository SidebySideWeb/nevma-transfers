import { describe, expect, it } from 'vitest';
import { HOUR_OPTIONS, joinTime12, splitTime12 } from './TimeField';

describe('TimeField 12h helpers', () => {
  it('keeps the hour list to 12 values', () => {
    expect(HOUR_OPTIONS).toHaveLength(12);
    expect(HOUR_OPTIONS.map((o) => o.value)).toEqual([
      '12',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
  });

  it('round-trips common times', () => {
    expect(joinTime12('12', '00', 'AM')).toBe('00:00');
    expect(joinTime12('12', '30', 'PM')).toBe('12:30');
    expect(joinTime12('2', '00', 'PM')).toBe('14:00');
    expect(joinTime12('9', '30', 'AM')).toBe('09:30');
    expect(splitTime12('14:00')).toEqual({ hour: '2', minute: '00', period: 'PM' });
    expect(splitTime12('00:00')).toEqual({ hour: '12', minute: '00', period: 'AM' });
    expect(splitTime12('09:20')).toEqual({ hour: '9', minute: '30', period: 'AM' });
  });
});
