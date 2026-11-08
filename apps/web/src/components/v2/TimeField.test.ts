import { describe, expect, it } from 'vitest';
import { joinTime12, splitTime12 } from './TimeField';

describe('TimeField 12h helpers', () => {
  it('round-trips common times', () => {
    expect(joinTime12('12:00', 'AM')).toBe('00:00');
    expect(joinTime12('12:30', 'PM')).toBe('12:30');
    expect(joinTime12('2:00', 'PM')).toBe('14:00');
    expect(joinTime12('9:30', 'AM')).toBe('09:30');
    expect(splitTime12('14:00')).toEqual({ hour12: '2:00', period: 'PM' });
    expect(splitTime12('00:00')).toEqual({ hour12: '12:00', period: 'AM' });
    expect(splitTime12('09:20')).toEqual({ hour12: '9:30', period: 'AM' });
  });
});
